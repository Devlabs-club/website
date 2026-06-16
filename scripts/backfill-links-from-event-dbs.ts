/**
 * Backfill builderProfiles from legacy event DBs + momentum (users/applications).
 *
 *   bun run scripts/backfill-links-from-event-dbs.ts -- --all --skip-enrich
 *   bun run scripts/backfill-links-from-event-dbs.ts -- --limit 10
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import { enrichBuilderProfile } from '../src/lib/talent/builderEnrichment';
import {
  hasEnrichmentSources,
  isUnenrichedProfile,
} from './lib/enrichment-queue-targets';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });

type SourceLinks = {
  resume: string | null;
  github: string | null;
  linkedin: string | null;
  portfolio: string | null;
};

type LegacyMatch = {
  source: string;
  documentId: string;
  fieldPath: string;
  links: SourceLinks;
  meta: Record<string, unknown>;
};

function eventDbUri(dbName: string): string {
  const uri = process.env.MONGODB_URI!;
  const url = new URL(uri);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function momentumDbUri(): string {
  const uri = process.env.MOMENTUM_MONGODB_URI || process.env.MONGODB_URI!;
  const url = new URL(uri);
  if (!url.pathname.includes('momentum')) {
    url.pathname = '/momentum';
  }
  return url.toString();
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function parseWebsiteOrGithub(value: unknown): { github: string | null; portfolio: string | null } {
  if (!isHttpUrl(value)) return { github: null, portfolio: null };
  const url = value.trim();
  if (/github\.com/i.test(url)) return { github: url, portfolio: null };
  return { github: null, portfolio: url };
}

function linksFromEventApplication(app: Record<string, unknown>): SourceLinks {
  const websiteOrGithub = parseWebsiteOrGithub(app.website);
  return {
    resume: typeof app.resumeUrl === 'string' ? app.resumeUrl.trim() || null : null,
    github: typeof app.github === 'string' ? app.github.trim() || null : websiteOrGithub.github,
    linkedin:
      (typeof app.linkedin === 'string' && app.linkedin.trim()) ||
      (typeof app.socialLink === 'string' && app.socialLink.trim()) ||
      null,
    portfolio:
      (typeof app.website === 'string' && app.website.trim()) || websiteOrGithub.portfolio,
  };
}

function linksFromMomentumApplication(app: Record<string, unknown>): SourceLinks {
  const fromSite = parseWebsiteOrGithub(app.websiteOrGithub);
  const pitchDeck = typeof app.pitchDeck === 'string' ? app.pitchDeck.trim() : '';
  const resume = isHttpUrl(pitchDeck) && /\.(pdf|doc|docx)(\?|$)/i.test(pitchDeck) ? pitchDeck : null;

  return {
    resume,
    github: fromSite.github,
    linkedin: isHttpUrl(app.linkedin) ? app.linkedin.trim() : null,
    portfolio: fromSite.portfolio,
  };
}

function hasAnyLink(links: SourceLinks): boolean {
  return Boolean(links.resume || links.github || links.linkedin || links.portfolio);
}

function parseArgs(argv: string[]) {
  const limitIdx = argv.indexOf('--limit');
  const offsetIdx = argv.indexOf('--offset');
  return {
    all: argv.includes('--all'),
    skipEnrich: argv.includes('--skip-enrich'),
    limit: limitIdx >= 0 ? Number(argv[limitIdx + 1] || 10) : 10,
    offset: offsetIdx >= 0 ? Number(argv[offsetIdx + 1] || 0) : 0,
  };
}

async function findEventDbMatch(
  conn: mongoose.Connection,
  dbName: string,
  builder: { name?: string | null; email?: string | null }
): Promise<LegacyMatch | null> {
  if (!conn.db) return null;

  const targetName = normalizeName(String(builder.name || ''));
  const targetEmail = String(builder.email || '')
    .toLowerCase()
    .trim();
  if (!targetName) return null;

  const usersCol = conn.db.collection('users');
  const appsCol = conn.db.collection('applications');

  let user: { _id: unknown; name?: string; email?: string } | null = null;

  if (targetEmail) {
    user = (await usersCol.findOne({
      email: { $regex: new RegExp(`^${targetEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    })) as typeof user;
  }

  if (!user) {
    const candidates = (await usersCol.find({ name: { $exists: true, $ne: '' } }).toArray()) as Array<{
      _id: unknown;
      name?: string;
    }>;
    user =
      candidates.find((u) => normalizeName(String(u.name || '')) === targetName) ||
      candidates.find((u) => normalizeName(String(u.name || '')).includes(targetName)) ||
      candidates.find((u) => targetName.includes(normalizeName(String(u.name || '')))) ||
      null;
  }

  if (!user?._id) return null;

  const application = (await appsCol.findOne({ user: user._id })) as Record<string, unknown> | null;
  if (!application) return null;

  const links = linksFromEventApplication(application);
  if (!hasAnyLink(links)) return null;

  return {
    source: dbName,
    documentId: String(application._id),
    fieldPath: 'applications.user',
    links,
    meta: { userId: String(user._id), email: user.email, name: user.name },
  };
}

async function findMomentumMatch(
  conn: mongoose.Connection,
  builder: { name?: string | null; email?: string | null }
): Promise<LegacyMatch | null> {
  if (!conn.db) return null;

  const targetName = normalizeName(String(builder.name || ''));
  const targetEmail = String(builder.email || '')
    .toLowerCase()
    .trim();
  if (!targetName && !targetEmail) return null;

  const appsCol = conn.db.collection('applications');
  let application: Record<string, unknown> | null = null;

  if (targetEmail) {
    application = (await appsCol.findOne({
      email: { $regex: new RegExp(`^${targetEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    })) as Record<string, unknown> | null;
  }

  if (!application) {
    const candidates = (await appsCol.find({ firstName: { $exists: true } }).toArray()) as Array<
      Record<string, unknown>
    >;
    application =
      candidates.find((app) => {
        const full = normalizeName(`${app.firstName || ''} ${app.lastName || ''}`);
        return full === targetName || full.includes(targetName) || targetName.includes(full);
      }) || null;
  }

  if (!application) return null;

  const links = linksFromMomentumApplication(application);
  if (!hasAnyLink(links)) return null;

  return {
    source: 'momentum',
    documentId: String(application._id),
    fieldPath: 'applications.userId',
    links,
    meta: {
      userId: application.userId ? String(application.userId) : null,
      email: application.email,
      name: `${application.firstName || ''} ${application.lastName || ''}`.trim(),
    },
  };
}

async function findLegacyMatch(
  eventConnections: Map<string, mongoose.Connection>,
  momentumConn: mongoose.Connection | null,
  builder: { name?: string | null; email?: string | null }
): Promise<LegacyMatch | null> {
  for (const [dbName, conn] of eventConnections) {
    const match = await findEventDbMatch(conn, dbName, builder);
    if (match) return match;
  }

  if (momentumConn) {
    const match = await findMomentumMatch(momentumConn, builder);
    if (match) return match;
  }

  return null;
}

async function main() {
  const { limit, offset, all: runAll, skipEnrich } = parseArgs(process.argv.slice(2));
  await mongoose.connect(process.env.MONGODB_URI!);

  const EVENT_DBS = ['devhacks', 'devhacks_ctw', 'devhacks_2025', 'devhouse-sf-edition'];
  const eventConnections = new Map<string, mongoose.Connection>();
  for (const dbName of EVENT_DBS) {
    try {
      eventConnections.set(dbName, await mongoose.createConnection(eventDbUri(dbName)).asPromise());
    } catch (err) {
      console.warn(`[backfill] could not connect to ${dbName}`, err);
    }
  }

  let momentumConn: mongoose.Connection | null = null;
  try {
    momentumConn = await mongoose.createConnection(momentumDbUri()).asPromise();
  } catch (err) {
    console.warn('[backfill] could not connect to momentum', err);
  }

  const builders = await BuilderProfile.find({ verificationStatus: { $ne: 'rejected' } })
    .select('_id name email headline bio rolePreference links updatedAt')
    .sort({ updatedAt: 1 })
    .lean();

  const pool = builders.filter((b) => isUnenrichedProfile(b) && !hasEnrichmentSources(b));
  const targets = runAll ? pool : pool.slice(offset, offset + limit);

  console.log(
    `[backfill] processing ${targets.length}/${pool.length} unenriched builders without links${skipEnrich ? ' (links only)' : ''}\n`
  );

  let matched = 0;
  let linksSaved = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const builderId = String(row._id);
    console.log(`\n[${i + 1}/${targets.length}] ${row.name} <${row.email}>`);

    const match = await findLegacyMatch(eventConnections, momentumConn, row);
    if (!match) {
      console.log('  no legacy match in event DBs or momentum');
      continue;
    }
    matched += 1;

    console.log(`  matched ${match.source} app=${match.documentId}`, match.meta);
    console.log('  legacy links:', match.links);

    const builder = await BuilderProfile.findById(builderId);
    if (!builder) {
      console.log('  builder doc missing');
      continue;
    }

    builder.links = builder.links || {};
    let linksUpdated = false;
    for (const [key, value] of Object.entries(match.links) as Array<
      [keyof SourceLinks, string | null]
    >) {
      if (!value || builder.links[key]) continue;
      builder.links[key] = value;
      linksUpdated = true;
    }

    if (linksUpdated) {
      builder.legacyRefs = builder.legacyRefs || [];
      builder.legacyRefs.push({
        collection: `${match.source}.applications`,
        documentId: match.documentId,
        fieldPath: match.fieldPath,
      });
      await builder.save();
      linksSaved += 1;
      console.log('  updated builder.links');
    } else {
      console.log('  links already set or empty in legacy app');
    }

    if (skipEnrich) continue;

    try {
      const result = await enrichBuilderProfile({
        builderId,
        sources: ['resume', 'github', 'devpost', 'linkedin', 'portfolio'],
        dryRun: false,
      });
      console.log(
        `  enrich ok fields=${result.profileFieldsUpdated.join(',') || 'none'} projects=+${result.projectsCreated}/~${result.projectsUpdated}`
      );
      if (result.sources.some((s) => s.errors?.length)) {
        console.log(
          '  source errors:',
          result.sources
            .filter((s) => s.errors?.length)
            .map((s) => `${s.source}:${s.errors?.join('|')}`)
            .join('; ')
        );
      }
    } catch (err) {
      console.error('  enrich failed', err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n[backfill] done matched=${matched} linksSaved=${linksSaved} scanned=${targets.length}`);

  for (const conn of eventConnections.values()) await conn.close();
  if (momentumConn) await momentumConn.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
