#!/usr/bin/env node
/**
 * Apply Bright Data / Cloudinary LinkedIn enrichment archive → BuilderProfile.
 *
 * Source of truth:
 *   ../enrichment-backups/linkedin-builders-raw-2026-08-05.jsonl
 *
 * The smaller resume-linkedin-*-2026-08-06.jsonl files are LinkedIn URL queues only.
 *
 * Usage:
 *   bun scripts/apply-linkedin-raw-archive.mjs --dry-run --limit 20
 *   bun scripts/apply-linkedin-raw-archive.mjs
 *   bun scripts/apply-linkedin-raw-archive.mjs --overwrite-avatars --reindex
 */
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

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
    limit: null,
    overwriteAvatars: false,
    overwriteBasics: false,
    reindex: false,
    builderIds: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--overwrite-avatars') args.overwriteAvatars = true;
    else if (arg === '--overwrite-basics') args.overwriteBasics = true;
    else if (arg === '--reindex') args.reindex = true;
    else if (arg === '--input') args.input = path.resolve(argv[++i]);
    else if (arg.startsWith('--input=')) args.input = path.resolve(arg.slice('--input='.length));
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--builder-ids') args.builderIds = new Set(String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive integer');
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

async function loadLocalEnv() {
  await loadEnvFile(path.join(ROOT, '.dev.vars'));
  await loadEnvFile(path.join(ROOT, '.env'));
}

function getMongoUri() {
  return process.env.DEVLABS_MONGO_URI || process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
}

async function importPackageFromRuntime(packageName) {
  try {
    return await import(packageName);
  } catch (originalError) {
    const require = createRequire(import.meta.url);
    const moduleDirs = String(process.env.PATH || '')
      .split(path.delimiter)
      .filter((entry) => entry.endsWith(`${path.sep}node_modules${path.sep}.bin`))
      .map((entry) => path.dirname(entry));
    for (const modulesDir of moduleDirs) {
      try {
        const resolved = require.resolve(packageName, { paths: [modulesDir] });
        return await import(pathToFileURL(resolved).href);
      } catch {
        // try next
      }
    }
    throw originalError;
  }
}

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normUrl(value) {
  if (!value) return null;
  return String(value).trim().split('?')[0].replace(/\/+$/, '').toLowerCase() || null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function dateLabel(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    const text = String(value.text || '').trim();
    if (text) return text;
    const month = String(value.month || '').trim();
    const year = value.year != null ? String(value.year) : '';
    return [month, year].filter(Boolean).join(' ') || null;
  }
  return null;
}

function pickLogoUrl(logo) {
  if (!logo) return null;
  if (typeof logo === 'string') return logo.trim() || null;
  if (typeof logo === 'object') {
    if (typeof logo.url === 'string' && logo.url.trim()) return logo.url.trim();
    if (typeof logo.src === 'string' && logo.src.trim()) return logo.src.trim();
    const sizes = Array.isArray(logo.sizes) ? logo.sizes : [];
    const best = [...sizes].sort((a, b) => Number(b?.width || 0) - Number(a?.width || 0))[0];
    if (best?.url) return String(best.url).trim();
  }
  return null;
}

function formatDateRange(start, end) {
  const startLabel = dateLabel(start);
  const endLabel = dateLabel(end);
  if (startLabel && endLabel) return `${startLabel} – ${endLabel}`;
  return startLabel || endLabel || null;
}

function mapExperience(entry, builderId, index, orgLogoByUrl) {
  const title = String(entry?.position || entry?.title || '').trim();
  const company = String(entry?.companyName || entry?.company || '').trim();
  if (!title && !company) return null;

  const companyLinkedInUrl = String(entry?.companyLinkedinUrl || entry?.companyLinkedInUrl || '').trim() || null;
  const cloudLogo = companyLinkedInUrl ? orgLogoByUrl.get(normUrl(companyLinkedInUrl)) : null;
  const companyLogoUrl = cloudLogo || pickLogoUrl(entry?.companyLogo || entry?.company_logo) || null;
  const startDateLabel = dateLabel(entry?.startDate);
  const endDateLabel = dateLabel(entry?.endDate);
  const dateRange = formatDateRange(entry?.startDate, entry?.endDate);
  const isCurrent = /present/i.test(String(endDateLabel || '')) || Boolean(entry?.isCurrent);
  const description = String(entry?.description || '').trim() || null;
  const sourceId =
    `linkedin:brightdata:${builderId}:${slugify(title)}:${slugify(company)}:${slugify(dateRange || index)}` ||
    `linkedin:brightdata:${builderId}:${index}`;

  return {
    title: title || 'Builder',
    company: company || 'Independent',
    companyLogoUrl,
    companyLinkedInUrl,
    employmentType: String(entry?.employmentType || '').trim() || null,
    location: String(entry?.location || '').trim() || null,
    dateRange,
    startDateLabel,
    endDateLabel,
    duration: String(entry?.duration || '').trim() || null,
    description,
    builderContribution: description,
    skills: Array.isArray(entry?.skills)
      ? entry.skills.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 16)
      : [],
    isCurrent,
    source: 'linkedin',
    sourceId,
    importedAt: new Date(),
  };
}

function mapEducation(entry, builderId, index, orgLogoByUrl) {
  const school = String(entry?.schoolName || entry?.school || '').trim();
  const degree = String(entry?.degree || '').trim() || null;
  const field = String(entry?.fieldOfStudy || entry?.field || '').trim() || null;
  if (!school && !degree && !field) return null;
  const schoolLinkedInUrl = String(entry?.schoolLinkedinUrl || entry?.schoolLinkedInUrl || '').trim() || null;
  const cloudLogo = schoolLinkedInUrl ? orgLogoByUrl.get(normUrl(schoolLinkedInUrl)) : null;
  const schoolLogoUrl = cloudLogo || pickLogoUrl(entry?.schoolLogo) || null;
  const dateRange = formatDateRange(entry?.startDate, entry?.endDate) || String(entry?.period || '').trim() || null;
  const endDateLabel = dateLabel(entry?.endDate);
  const graduationYear = Number(String(endDateLabel || dateRange || '').match(/\b(19|20)\d{2}\b/)?.[0] || NaN);
  return {
    school: school || null,
    degree,
    field,
    dateRange,
    startDateLabel: dateLabel(entry?.startDate),
    endDateLabel,
    graduationYear: Number.isFinite(graduationYear) ? graduationYear : null,
    schoolLogoUrl,
    schoolLinkedInUrl,
    source: 'linkedin',
    sourceId: `linkedin:brightdata:edu:${builderId}:${slugify(school)}:${slugify(degree)}:${slugify(dateRange || index)}`,
    importedAt: new Date(),
  };
}

function mergeBySourceId(existing = [], incoming = [], limit = 40) {
  const map = new Map();
  for (const entry of existing) {
    const key = String(entry?.sourceId || `${entry?.title}|${entry?.company}|${entry?.dateRange}`).toLowerCase();
    if (key) map.set(key, entry);
  }
  for (const entry of incoming) {
    const key = String(entry?.sourceId || `${entry?.title}|${entry?.company}|${entry?.dateRange}`).toLowerCase();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, entry);
      continue;
    }
    map.set(key, {
      ...prev,
      ...entry,
      companyLogoUrl: entry.companyLogoUrl || prev.companyLogoUrl || null,
      companyLinkedInUrl: entry.companyLinkedInUrl || prev.companyLinkedInUrl || null,
      schoolLogoUrl: entry.schoolLogoUrl || prev.schoolLogoUrl || null,
      schoolLinkedInUrl: entry.schoolLinkedInUrl || prev.schoolLinkedInUrl || null,
      description: entry.description || prev.description || null,
      builderContribution: entry.builderContribution || prev.builderContribution || null,
      skills: Array.from(new Set([...(prev.skills || []), ...(entry.skills || [])])).slice(0, 16),
    });
  }
  return Array.from(map.values()).slice(0, limit);
}

function mergeSkills(existing = [], incoming = []) {
  const out = [];
  const seen = new Set();
  for (const skill of [...existing, ...incoming]) {
    const cleaned = String(skill || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out.slice(0, 48);
}

async function loadArchive(inputPath, builderIdFilter = null) {
  const profiles = new Map(); // builderId -> record
  const avatars = new Map(); // builderId -> permanentUrl
  const orgLogos = new Map(); // normalized org url -> permanentUrl

  const rl = createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const type = row.recordType;
    if (type === 'profile_source_result' && row.ok && row.builderId) {
      const bid = String(row.builderId);
      if (builderIdFilter && !builderIdFilter.has(bid)) continue;
      const prev = profiles.get(bid);
      const nextExp = Array.isArray(row.raw?.experience) ? row.raw.experience.length : 0;
      const prevExp = Array.isArray(prev?.raw?.experience) ? prev.raw.experience.length : 0;
      const nextEdu = Array.isArray(row.raw?.education) ? row.raw.education.length : 0;
      const prevEdu = Array.isArray(prev?.raw?.education) ? prev.raw.education.length : 0;
      // Prefer the richest scrape (experiences first, then education). Do not let a
      // later empty Apify row wipe a Bright Data profile that already has work history.
      if (!prev || nextExp > prevExp || (nextExp === prevExp && nextEdu > prevEdu)) {
        profiles.set(bid, row);
      }
    } else if (type === 'cloudinary_asset_result' && row.ok) {
      const permanentUrl = row.cloudinary?.permanentUrl;
      if (!permanentUrl) continue;
      if (row.assetType === 'builder_avatar' && row.builderId) {
        const bid = String(row.builderId);
        if (builderIdFilter && !builderIdFilter.has(bid)) continue;
        avatars.set(bid, permanentUrl);
      } else if (row.assetType === 'organization_logo' && row.organizationUrl) {
        orgLogos.set(normUrl(row.organizationUrl), permanentUrl);
      }
    }
  }

  return { profiles, avatars, orgLogos };
}

async function syncUserAvatar(users, builder, avatarUrl) {
  try {
    const filter = builder.userId
      ? { _id: builder.userId }
      : builder.email
        ? { email: String(builder.email).toLowerCase() }
        : null;
    if (!filter) return false;
    await users.updateOne(filter, { $set: { avatarUrl } });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadLocalEnv();
  if (!existsSync(args.input)) throw new Error(`Input not found: ${args.input}`);
  const mongoUri = getMongoUri();
  if (!mongoUri) throw new Error('Missing ADMIN_MONGO_URI / DEVLABS_MONGO_URI / MONGODB_URI');

  console.log('[apply-raw] loading archive', args.input);
  const { profiles, avatars, orgLogos } = await loadArchive(args.input, args.builderIds);
  console.log('[apply-raw] ok profiles', profiles.size, 'cloudinary avatars', avatars.size, 'org logos', orgLogos.size);

  let builderIds = [...profiles.keys()];
  if (args.limit) builderIds = builderIds.slice(0, args.limit);

  const { MongoClient, ObjectId } = await importPackageFromRuntime('mongodb');
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db();
  const builders = db.collection('builderprofiles');
  const users = db.collection('users');

  const stats = {
    scanned: 0,
    updated: 0,
    skippedMissingBuilder: 0,
    avatarSet: 0,
    experiencesSet: 0,
    educationSet: 0,
    basicsSet: 0,
    userAvatarSynced: 0,
    errors: 0,
  };

  const updatedIds = [];

  for (const builderId of builderIds) {
    stats.scanned += 1;
    const record = profiles.get(builderId);
    const raw = record?.raw || {};
    try {
      const builder = await builders.findOne({ _id: new ObjectId(builderId) });
      if (!builder) {
        stats.skippedMissingBuilder += 1;
        continue;
      }

      const $set = {};
      const experiences = (raw.experience || [])
        .map((entry, index) => mapExperience(entry, builderId, index, orgLogos))
        .filter(Boolean);
      const education = (raw.education || [])
        .map((entry, index) => mapEducation(entry, builderId, index, orgLogos))
        .filter(Boolean);

      if (experiences.length) {
        $set.experiences = mergeBySourceId(builder.experiences || [], experiences, 40);
        stats.experiencesSet += 1;
      }
      if (education.length) {
        $set.education = mergeBySourceId(builder.education || [], education, 12);
        stats.educationSet += 1;
      }

      const cloudAvatar = avatars.get(builderId) || null;
      const rawAvatar =
        raw.avatar && raw.default_avatar !== true && !/default.?avatar|ghost/i.test(String(raw.avatar))
          ? String(raw.avatar).trim()
          : null;
      const nextAvatar = cloudAvatar || rawAvatar;
      if (nextAvatar) {
        const shouldSet =
          args.overwriteAvatars ||
          isEmpty(builder.avatarUrl) ||
          (cloudAvatar && String(builder.avatarUrl || '').includes('licdn.com'));
        if (shouldSet && builder.avatarUrl !== nextAvatar) {
          $set.avatarUrl = nextAvatar;
          stats.avatarSet += 1;
        }
      }

      const headline = String(raw.position || raw.headline || '').trim();
      const bio = String(raw.about || '').trim();
      const location = String(raw.city || raw.location || '').trim();
      const linkedin = String(record.linkedinUrl || raw.url || raw.input_url || '').trim();

      if (headline && (args.overwriteBasics || isEmpty(builder.headline))) {
        $set.headline = headline.slice(0, 160);
        stats.basicsSet += 1;
      }
      if (bio && (args.overwriteBasics || isEmpty(builder.bio))) {
        $set.bio = bio.slice(0, 4000);
        stats.basicsSet += 1;
      }
      if (location && (args.overwriteBasics || isEmpty(builder.location))) {
        $set.location = location.slice(0, 160);
        stats.basicsSet += 1;
      }
      if (linkedin && (args.overwriteBasics || isEmpty(builder.links?.linkedin))) {
        $set['links.linkedin'] = linkedin;
        stats.basicsSet += 1;
      }

      const skillPool = [];
      for (const exp of experiences) skillPool.push(...(exp.skills || []));
      if (Array.isArray(raw.skills)) skillPool.push(...raw.skills.map(String));
      if (skillPool.length) {
        $set.skills = mergeSkills(builder.skills || [], skillPool);
      }

      if (education[0]?.school && (args.overwriteBasics || isEmpty(builder.universityOrCompany))) {
        $set.universityOrCompany = education[0].school;
      }
      if (education[0]?.graduationYear && !builder.graduationYear) {
        $set.graduationYear = education[0].graduationYear;
      }

      $set['enrichment.linkedinRawAppliedAt'] = new Date();
      $set['enrichment.linkedinRawSource'] = record.source || 'brightdata_profile';

      if (!Object.keys($set).length) continue;

      if (!args.dryRun) {
        await builders.updateOne({ _id: builder._id }, { $set });
        if ($set.avatarUrl) {
          const synced = await syncUserAvatar(users, builder, $set.avatarUrl);
          if (synced) stats.userAvatarSynced += 1;
        }
      }

      stats.updated += 1;
      updatedIds.push(builderId);
      if (stats.updated <= 8 || stats.updated % 100 === 0) {
        console.log('[apply-raw] updated', builder.name || builderId, {
          avatar: Boolean($set.avatarUrl),
          experiences: $set.experiences?.length || 0,
          education: $set.education?.length || 0,
          headline: Boolean($set.headline),
        });
      }
    } catch (error) {
      stats.errors += 1;
      console.warn('[apply-raw] failed', builderId, error instanceof Error ? error.message : error);
    }
  }

  if (args.reindex && !args.dryRun && updatedIds.length) {
    console.log('[apply-raw] reindexing talent search for', updatedIds.length, 'builders');
    try {
      // Dynamic import of TS helpers via bun if available
      const { connectAdminDB } = await import('../src/lib/mongodb.ts');
      const BuilderProfile = (await import('../src/models/talent/BuilderProfile.ts')).default;
      const ProjectRecord = (await import('../src/models/talent/ProjectRecord.ts')).default;
      const { upsertTalentSearchIndexForBuilder } = await import('../src/lib/talent/searchIndex.ts');
      await connectAdminDB();
      for (const id of updatedIds) {
        const builder = await BuilderProfile.findById(id);
        if (!builder) continue;
        const projects = await ProjectRecord.find({ builderId: builder._id }).limit(20).lean();
        await upsertTalentSearchIndexForBuilder(builder, projects);
      }
      console.log('[apply-raw] reindex done');
    } catch (error) {
      console.warn('[apply-raw] reindex skipped/failed', error instanceof Error ? error.message : error);
    }
  }

  console.log('[apply-raw] done', { ...stats, dryRun: args.dryRun });
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
