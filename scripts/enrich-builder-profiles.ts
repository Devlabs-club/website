/**
 * Batch-enrich DevLabs builder profiles from resume, GitHub, Devpost, LinkedIn, and portfolio sources.
 *
 * Usage:
 *   bun run enrich:builders -- --limit 20 --sources resume,github,devpost
 *   bun run enrich:builders -- --builder-id <mongoId>
 *   bun run enrich:builders -- --dry-run --limit 5
 *
 * LinkedIn authenticated view (avoids guest/locked profile):
 *   1. Log into linkedin.com in your browser
 *   2. DevTools → Application → Cookies → copy `li_at` (and optionally `JSESSIONID`)
 *   3. Add to .dev.vars:
 *        LINKEDIN_LI_AT_COOKIE=...
 *        LINKEDIN_JSESSIONID_COOKIE=...   # optional
 *
 * GitHub rate limits: set GITHUB_TOKEN in .dev.vars for higher limits.
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import {
  enrichBuilderProfile,
  type EnrichmentSource,
} from '../src/lib/talent/builderEnrichment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });
dotenv.config({ path: join(__dirname, '../.env') });

const ALL_SOURCES: EnrichmentSource[] = ['resume', 'github', 'devpost', 'linkedin', 'portfolio'];

function parseArgs(argv: string[]) {
  const args = {
    limit: 25,
    dryRun: false,
    builderId: null as string | null,
    sources: [...ALL_SOURCES] as EnrichmentSource[],
    sleepMs: 1500,
    overwriteImportedProjects: true,
    onlyMissingHeadline: false,
    onlyWithResume: false,
    onlyWithGithub: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--only-missing-headline') args.onlyMissingHeadline = true;
    else if (arg === '--only-with-resume') args.onlyWithResume = true;
    else if (arg === '--only-with-github') args.onlyWithGithub = true;
    else if (arg === '--limit') args.limit = Number(argv[++i] || 25);
    else if (arg === '--sleep-ms') args.sleepMs = Number(argv[++i] || 1500);
    else if (arg === '--builder-id') args.builderId = argv[++i] || null;
    else if (arg === '--sources') {
      const raw = (argv[++i] || '').split(',').map((s) => s.trim()) as EnrichmentSource[];
      args.sources = raw.filter((s) => ALL_SOURCES.includes(s));
    }
  }

  return args;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.ADMIN_MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);

  let builders: any[] = [];
  if (args.builderId) {
    const one = await BuilderProfile.findById(args.builderId).lean();
    if (!one) throw new Error(`Builder not found: ${args.builderId}`);
    builders = [one];
  } else {
    const query: Record<string, unknown> = { verificationStatus: { $ne: 'rejected' } };
    if (args.onlyMissingHeadline) {
      query.$or = [{ headline: null }, { headline: '' }];
    }
    if (args.onlyWithResume) {
      query['links.resume'] = { $exists: true, $nin: [null, ''] };
    }
    if (args.onlyWithGithub) {
      query['links.github'] = { $exists: true, $nin: [null, ''] };
    }

    builders = await BuilderProfile.find(query)
      .sort({ updatedAt: 1 })
      .limit(args.limit)
      .lean();
  }

  console.log(
    `[enrich-builders] processing ${builders.length} builders | sources=${args.sources.join(',')} | dryRun=${args.dryRun}`
  );

  let success = 0;
  let failed = 0;

  for (const builder of builders) {
    const label = `${builder.name} <${builder.email}>`;
    try {
      const result = await enrichBuilderProfile({
        builderId: String(builder._id),
        sources: args.sources,
        dryRun: args.dryRun,
        overwriteImportedProjects: args.overwriteImportedProjects,
      });

      const projectCount = result.sources.reduce((sum, s) => sum + (s.projects?.length || 0), 0);
      const errors = result.sources.flatMap((s) => s.errors || []);

      console.log(
        `[ok] ${label} | profileFields=${result.profileFieldsUpdated.join(',') || 'none'} | projects=${projectCount} | created=${result.projectsCreated} updated=${result.projectsUpdated}${errors.length ? ` | errors=${errors.join(';')}` : ''}`
      );
      success += 1;
    } catch (err) {
      console.error(`[fail] ${label}`, err instanceof Error ? err.message : err);
      failed += 1;
    }

    if (args.sleepMs > 0) await sleep(args.sleepMs);
  }

  console.log(`[enrich-builders] done success=${success} failed=${failed}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
