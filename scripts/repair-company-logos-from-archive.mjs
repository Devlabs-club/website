#!/usr/bin/env node
/**
 * Repair broken LinkedIn CDN company logos using the 2026-08-05 Bright Data /
 * Apify → Cloudinary archive.
 *
 * Why: media.licdn.com logo URLs expire (403). Cloudinary permanent URLs from
 * the enrichment run are durable and already in the JSONL archive.
 *
 * Usage:
 *   bun scripts/repair-company-logos-from-archive.mjs --dry-run
 *   bun scripts/repair-company-logos-from-archive.mjs
 *   bun scripts/repair-company-logos-from-archive.mjs --clear-expired-licdn
 */
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.resolve(
  ROOT,
  '../enrichment-backups/linkedin-builders-raw-2026-08-05.jsonl'
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    dryRun: false,
    clearExpiredLicdn: true,
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--keep-expired-licdn') args.clearExpiredLicdn = false;
    else if (arg === '--clear-expired-licdn') args.clearExpiredLicdn = true;
    else if (arg === '--input') args.input = path.resolve(argv[++i]);
    else if (arg.startsWith('--input=')) args.input = path.resolve(arg.slice('--input='.length));
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = await readFile(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
  }
}

function normUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
}

function companySlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(co\.?|company|inc\.?|incorporated|llc|ltd\.?|limited|corp\.?|corporation|plc)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function linkedInSlug(url) {
  const match = String(url || '').match(/\/(?:company|school)\/([^/?#]+)/i);
  return match ? match[1].toLowerCase().replace(/-/g, '') : null;
}

function isLicdn(url) {
  return /media\.licdn\.com|static\.licdn\.com/i.test(String(url || ''));
}

function isCloudinary(url) {
  return /res\.cloudinary\.com/i.test(String(url || ''));
}

async function loadOrgLogoMaps(inputPath) {
  const byUrl = new Map();
  const bySlug = new Map();
  const rl = createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('organization_logo')) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.recordType !== 'cloudinary_asset_result' || !row.ok || row.assetType !== 'organization_logo') {
      continue;
    }
    const permanentUrl = row.cloudinary?.permanentUrl;
    const organizationUrl = normUrl(row.organizationUrl);
    if (!permanentUrl || !organizationUrl) continue;
    byUrl.set(organizationUrl, permanentUrl);
    const slug = linkedInSlug(organizationUrl);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, { permanentUrl, organizationUrl: row.organizationUrl });
  }
  return { byUrl, bySlug };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFile(path.join(ROOT, '.dev.vars'));
  await loadEnvFile(path.join(ROOT, '.env'));

  if (!existsSync(args.input)) throw new Error(`Archive not found: ${args.input}`);
  const mongoUri = process.env.DEVLABS_MONGO_URI || process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('Missing ADMIN_MONGO_URI / DEVLABS_MONGO_URI / MONGODB_URI');

  console.log('[repair-logos] loading Cloudinary org map from', args.input);
  const { byUrl, bySlug } = await loadOrgLogoMaps(args.input);
  console.log('[repair-logos] org logos by url', byUrl.size, 'by slug', bySlug.size);

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(mongoUri);
  await client.connect();
  const col = client.db().collection('builderprofiles');

  // Inherit LinkedIn company URLs from peers that already have them.
  const nameToLi = new Map();
  for await (const builder of col.find({}, { projection: { experiences: 1 } })) {
    for (const experience of builder.experiences || []) {
      const name = String(experience.company || '')
        .trim()
        .toLowerCase();
      const li = String(experience.companyLinkedInUrl || '').trim();
      if (name && li && /linkedin\.com\/(?:company|school)\//i.test(li) && !nameToLi.has(name)) {
        nameToLi.set(name, li.replace(/\/+$/, ''));
      }
    }
  }

  const stats = {
    buildersScanned: 0,
    buildersUpdated: 0,
    logosReplaced: 0,
    linkedInUrlsFilled: 0,
    licdnCleared: 0,
    unchanged: 0,
  };

  const cursor = col.find(
    {
      $or: [
        { 'experiences.companyLogoUrl': { $exists: true } },
        { 'experiences.company': { $exists: true } },
      ],
    },
    { projection: { experiences: 1, name: 1, email: 1 } }
  );

  for await (const builder of cursor) {
    stats.buildersScanned += 1;
    if (args.limit && stats.buildersUpdated >= args.limit) break;

    const experiences = Array.isArray(builder.experiences) ? builder.experiences : [];
    if (!experiences.length) continue;

    let changed = false;
    const nextExperiences = experiences.map((experience) => {
      const company = String(experience.company || '').trim();
      let companyLinkedInUrl = String(experience.companyLinkedInUrl || '').trim() || null;
      let companyLogoUrl = String(experience.companyLogoUrl || '').trim() || null;
      const beforeLogo = companyLogoUrl;
      const beforeLi = companyLinkedInUrl;

      if (!companyLinkedInUrl) {
        const inherited = nameToLi.get(company.toLowerCase());
        if (inherited) {
          companyLinkedInUrl = inherited;
          stats.linkedInUrlsFilled += 1;
          changed = true;
        }
      }

      const fromUrl = companyLinkedInUrl ? byUrl.get(normUrl(companyLinkedInUrl)) : null;
      const slugHit =
        bySlug.get(companySlug(company)) ||
        (companyLinkedInUrl ? bySlug.get(linkedInSlug(companyLinkedInUrl) || '') : null);
      const cloudLogo = fromUrl || slugHit?.permanentUrl || null;
      if (cloudLogo && companyLogoUrl !== cloudLogo) {
        companyLogoUrl = cloudLogo;
        stats.logosReplaced += 1;
        changed = true;
      }
      if (!companyLinkedInUrl && slugHit?.organizationUrl) {
        companyLinkedInUrl = String(slugHit.organizationUrl).replace(/\/+$/, '');
        stats.linkedInUrlsFilled += 1;
        changed = true;
      }

      if (args.clearExpiredLicdn && isLicdn(companyLogoUrl) && !isCloudinary(companyLogoUrl)) {
        companyLogoUrl = null;
        stats.licdnCleared += 1;
        changed = true;
      }

      if (beforeLogo === companyLogoUrl && beforeLi === companyLinkedInUrl) {
        stats.unchanged += 1;
        return experience;
      }

      return {
        ...experience,
        companyLogoUrl,
        companyLinkedInUrl,
      };
    });

    if (!changed) continue;
    stats.buildersUpdated += 1;
    console.log(
      JSON.stringify({
        event: args.dryRun ? 'would_update' : 'update',
        builderId: String(builder._id),
        name: builder.name || null,
        email: builder.email || null,
      })
    );
    if (!args.dryRun) {
      await col.updateOne({ _id: builder._id }, { $set: { experiences: nextExperiences } });
    }
  }

  await client.close();
  console.log('[repair-logos] done', { ...stats, dryRun: args.dryRun });
}

main().catch((error) => {
  console.error('[repair-logos] failed', error);
  process.exitCode = 1;
});
