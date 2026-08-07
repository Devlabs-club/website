#!/usr/bin/env node
/**
 * Re-scrape organization logos via Bright Data + Apify for companies whose
 * LinkedIn CDN logos are expired / missing, then upload to Cloudinary and
 * patch BuilderProfile.experiences[].companyLogoUrl.
 *
 * Requires:
 *   BRIGHTDATA_API_KEY
 *   APIFY_API_TOKEN
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 *   ADMIN_MONGO_URI (or DEVLABS_MONGO_URI / MONGODB_URI)
 *
 * Usage:
 *   bun scripts/refresh-company-logos-bright-apify.mjs --dry-run --limit 20
 *   bun scripts/refresh-company-logos-bright-apify.mjs --limit 50
 *   bun scripts/refresh-company-logos-bright-apify.mjs --companies pretorn,wipro
 */
import { existsSync } from 'node:fs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIGHT_ORGANIZATION_DATASET = 'gd_l1vikfnt1wgvvqz95w';
const APIFY_ORGANIZATION_ACTOR = 'harvestapi~linkedin-company';
const DEFAULT_ARCHIVE = path.resolve(
  ROOT,
  '../enrichment-backups/linkedin-org-logo-refresh.jsonl'
);

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: null,
    companies: null,
    archive: DEFAULT_ARCHIVE,
    skipBright: false,
    pollMs: 8000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--skip-bright') args.skipBright = true;
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--archive') args.archive = path.resolve(argv[++i]);
    else if (arg === '--companies') {
      args.companies = new Set(
        String(argv[++i])
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      );
    } else if (arg === '--poll-ms') args.pollMs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of (await readFile(filePath, 'utf8')).split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
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
    .replace(/[^a-z0-9]+/g, '');
}

function linkedInIdentity(url) {
  const match = String(url || '').match(/linkedin\.com\/(company|school)\/([^/?#]+)/i);
  if (!match) return null;
  return { type: match[1].toLowerCase(), id: match[2].toLowerCase() };
}

function isJunkCompanyLabel(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/^(full[-\s]?time|part[-\s]?time|internship|intern|contract|freelance|self[-\s]?employed|temporary|volunteer)$/i.test(text)) {
    return true;
  }
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) return true;
  if (/^\d{4}/.test(text) && /present|–|-/.test(text)) return true;
  return false;
}

function isLicdn(url) {
  return /media\.licdn\.com|static\.licdn\.com/i.test(String(url || ''));
}

function isCloudinary(url) {
  return /res\.cloudinary\.com/i.test(String(url || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}: ${text.slice(0, 400)}`);
  }
  return json;
}

async function appendRecord(archivePath, record) {
  await appendFile(archivePath, `${JSON.stringify({ archivedAt: new Date().toISOString(), ...record })}\n`);
}

function findLogoUrls(raw) {
  const logos = new Set();
  const walk = (value, key = '') => {
    if (!value) return;
    if (typeof value === 'string') {
      if (/logo|image|picture|avatar/i.test(key) && /^https?:\/\//i.test(value)) logos.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${key}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
    }
  };
  walk(raw);
  if (typeof raw?.logo === 'string') logos.add(raw.logo);
  if (Array.isArray(raw?.logos)) {
    for (const logo of raw.logos) {
      if (typeof logo?.url === 'string') logos.add(logo.url);
      if (typeof logo === 'string') logos.add(logo);
    }
  }
  return [...logos].filter((url) => /^https?:\/\//i.test(url));
}

async function runBrightOrganizations(urls, apiKey, args, archivePath) {
  const results = new Map();
  if (!urls.length || args.skipBright) return results;

  const payload = urls.map((url) => ({ url }));
  const trigger = await requestJson(
    `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHT_ORGANIZATION_DATASET}&include_errors=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  const snapshotId = trigger?.snapshot_id || trigger?.snapshotId;
  if (!snapshotId) throw new Error('Bright Data organization trigger returned no snapshot_id');
  await appendRecord(archivePath, {
    recordType: 'provider_request',
    provider: 'brightdata',
    kind: 'organization',
    snapshotId,
    inputUrls: urls,
  });

  let rows = [];
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await requestJson(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const state = String(status?.status || status?.state || '').toLowerCase();
    if (state === 'ready' || state === 'done' || state === 'completed') {
      const download = await fetch(
        `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      rows = await download.json();
      if (!Array.isArray(rows)) rows = [];
      break;
    }
    if (state === 'failed' || state === 'error') {
      throw new Error(`Bright Data snapshot failed: ${JSON.stringify(status).slice(0, 300)}`);
    }
    await sleep(args.pollMs);
  }

  for (const raw of rows) {
    const candidates = [raw?.url, raw?.input?.url, raw?.input_url, raw?.linkedin_url, raw?.linkedinUrl]
      .map(normUrl)
      .filter(Boolean);
    const match = candidates.find((url) => urls.map(normUrl).includes(url));
    const logoUrls = findLogoUrls(raw);
    const organizationUrl = match || candidates[0];
    if (!organizationUrl) continue;
    const ok = logoUrls.length > 0;
    await appendRecord(archivePath, {
      recordType: 'organization_source_result',
      source: 'brightdata_organization',
      ok,
      organizationUrl,
      logoUrls,
      raw,
      snapshotId,
    });
    if (ok) results.set(normUrl(organizationUrl), logoUrls[0]);
  }
  return results;
}

async function runApifyOrganizations(urls, apiKey, args, archivePath) {
  const results = new Map();
  if (!urls.length) return results;

  const start = await requestJson(`https://api.apify.com/v2/acts/${APIFY_ORGANIZATION_ACTOR}/runs?waitForFinish=0`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      companies: urls,
      includeAbout: false,
      includePosts: false,
    }),
  });
  const run = start?.data || start;
  const runId = run?.id;
  if (!runId) throw new Error('Apify organization run missing id');
  await appendRecord(archivePath, {
    recordType: 'provider_request',
    provider: 'apify',
    actorId: APIFY_ORGANIZATION_ACTOR,
    runId,
    inputUrls: urls,
    kind: 'organization_fallback',
  });

  let finished = run;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = String(finished?.status || '').toUpperCase();
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) break;
    await sleep(args.pollMs);
    const payload = await requestJson(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    finished = payload?.data || payload;
  }
  if (String(finished?.status || '').toUpperCase() !== 'SUCCEEDED') {
    throw new Error(`Apify organization run did not succeed: ${finished?.status}`);
  }

  const datasetId = finished?.defaultDatasetId;
  const items = await requestJson(
    `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const rows = Array.isArray(items) ? items : [];
  const requested = new Set(urls.map(normUrl));
  for (const raw of rows) {
    const candidates = [raw?.linkedinUrl, raw?.linkedin_url, raw?.url, raw?.input?.url]
      .map(normUrl)
      .filter(Boolean);
    const organizationUrl = candidates.find((url) => requested.has(url)) || candidates[0];
    const logoUrls = findLogoUrls(raw);
    if (!organizationUrl || !logoUrls.length) continue;
    await appendRecord(archivePath, {
      recordType: 'organization_source_result',
      source: 'apify_organization',
      ok: true,
      organizationUrl,
      logoUrls,
      raw,
      runId,
    });
    results.set(normUrl(organizationUrl), logoUrls[0]);
  }
  return results;
}

async function uploadLogo(organizationUrl, sourceUrl) {
  const identity = linkedInIdentity(organizationUrl);
  if (!identity) throw new Error(`Bad organization url: ${organizationUrl}`);
  const publicId = `devlabs/enrichment/organizations/${identity.type}/${identity.id}/logo`;
  const uploaded = await cloudinary.uploader.upload(sourceUrl, {
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    resource_type: 'image',
    folder: undefined,
  });
  return {
    permanentUrl: uploaded.secure_url || uploaded.url,
    publicId: uploaded.public_id,
    version: uploaded.version,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFile(path.join(ROOT, '.dev.vars'));
  await loadEnvFile(path.join(ROOT, '.env'));

  const mongoUri = process.env.DEVLABS_MONGO_URI || process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
  const brightKey = process.env.BRIGHTDATA_API_KEY;
  const apifyKey = process.env.APIFY_API_TOKEN;
  if (!mongoUri) throw new Error('Missing Mongo URI');
  if (!args.dryRun) {
    if (!brightKey && !args.skipBright) throw new Error('Missing BRIGHTDATA_API_KEY (or pass --skip-bright)');
    if (!apifyKey) throw new Error('Missing APIFY_API_TOKEN');
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Missing Cloudinary credentials');
    }
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  await mkdir(path.dirname(args.archive), { recursive: true });
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(mongoUri);
  await client.connect();
  const col = client.db().collection('builderprofiles');

  const nameToLi = new Map();
  const needs = new Map(); // normUrl -> { url, companies:Set }
  for await (const builder of col.find({}, { projection: { experiences: 1 } })) {
    for (const experience of builder.experiences || []) {
      const company = String(experience.company || '').trim();
      const logo = String(experience.companyLogoUrl || '').trim();
      let li = String(experience.companyLinkedInUrl || '').trim();
      if (isJunkCompanyLabel(company)) continue;
      if (company && li && /linkedin\.com\/(?:company|school)\//i.test(li) && !nameToLi.has(company.toLowerCase())) {
        nameToLi.set(company.toLowerCase(), li.replace(/\/+$/, ''));
      }
      const broken = !logo || isLicdn(logo);
      if (!broken) continue;
      if (!li) li = nameToLi.get(company.toLowerCase()) || '';
      if (!li || !/linkedin\.com\/(?:company|school)\//i.test(li)) continue;
      if (args.companies && !args.companies.has(companySlug(company)) && !args.companies.has(linkedInIdentity(li)?.id || '')) {
        continue;
      }
      const key = normUrl(li);
      const entry = needs.get(key) || { url: li.replace(/\/+$/, ''), companies: new Set() };
      if (company) entry.companies.add(company);
      needs.set(key, entry);
    }
  }

  let targets = [...needs.values()];
  if (args.limit) targets = targets.slice(0, args.limit);
  console.log('[refresh-logos] organizations to refresh', targets.length);
  if (args.dryRun) {
    console.log(targets.slice(0, 30).map((t) => ({ url: t.url, companies: [...t.companies] })));
    await client.close();
    return;
  }

  const urls = targets.map((t) => t.url);
  const brightHits = await runBrightOrganizations(urls, brightKey, args, args.archive);
  const missingAfterBright = urls.filter((url) => !brightHits.has(normUrl(url)));
  const apifyHits = await runApifyOrganizations(missingAfterBright, apifyKey, args, args.archive);

  const logoByOrg = new Map([...brightHits, ...apifyHits]);
  let uploaded = 0;
  let patchedBuilders = 0;
  const permanentByOrg = new Map();

  for (const [orgUrl, sourceUrl] of logoByOrg) {
    try {
      const cloud = await uploadLogo(orgUrl, sourceUrl);
      permanentByOrg.set(orgUrl, cloud.permanentUrl);
      await appendRecord(args.archive, {
        recordType: 'cloudinary_asset_result',
        ok: true,
        assetType: 'organization_logo',
        organizationUrl: orgUrl,
        sourceUrl,
        cloudinary: cloud,
      });
      uploaded += 1;
      console.log(JSON.stringify({ event: 'uploaded', organizationUrl: orgUrl, permanentUrl: cloud.permanentUrl }));
    } catch (error) {
      await appendRecord(args.archive, {
        recordType: 'cloudinary_asset_result',
        ok: false,
        assetType: 'organization_logo',
        organizationUrl: orgUrl,
        sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      console.warn('[refresh-logos] cloudinary upload failed', orgUrl, error);
    }
  }

  for await (const builder of col.find({ 'experiences.0': { $exists: true } }, { projection: { experiences: 1 } })) {
    let changed = false;
    const next = (builder.experiences || []).map((experience) => {
      const company = String(experience.company || '').trim();
      let li = String(experience.companyLinkedInUrl || '').trim() || nameToLi.get(company.toLowerCase()) || null;
      const permanent = li ? permanentByOrg.get(normUrl(li)) : null;
      if (!permanent) return experience;
      changed = true;
      return {
        ...experience,
        companyLinkedInUrl: li,
        companyLogoUrl: permanent,
      };
    });
    if (!changed) continue;
    await col.updateOne({ _id: builder._id }, { $set: { experiences: next } });
    patchedBuilders += 1;
  }

  await client.close();
  console.log('[refresh-logos] done', {
    targets: targets.length,
    bright: brightHits.size,
    apify: apifyHits.size,
    uploaded,
    patchedBuilders,
    archive: args.archive,
  });
}

main().catch((error) => {
  console.error('[refresh-logos] failed', error);
  process.exitCode = 1;
});
