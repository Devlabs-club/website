#!/usr/bin/env node
/**
 * Fetch LinkedIn enrichment artifacts for the strongest eligible builder profiles.
 *
 * This runs on the operator machine and sends one authenticated request at a time
 * to the existing Railway Chrome/CDP service. It deliberately does not create a
 * second always-on worker service. Run apply-linkedin-enrichment.mjs followed by
 * backfill-targeted-talent-embeddings.mjs after this completes.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_OUTPUT_DIR = '.context/linkedin-enrichment';
const DEFAULT_SCRAPER_URL = 'https://enrich-scraper-production.up.railway.app';

function parseArgs(argv) {
  const args = {
    limit: 300,
    outputDir: DEFAULT_OUTPUT_DIR,
    delayMs: 1500,
    waitMs: 12000,
    resume: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--output-dir') args.outputDir = argv[++index];
    else if (arg.startsWith('--output-dir=')) args.outputDir = arg.slice('--output-dir='.length);
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++index]);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.slice('--delay-ms='.length));
    else if (arg === '--wait-ms') args.waitMs = Number(argv[++index]);
    else if (arg.startsWith('--wait-ms=')) args.waitMs = Number(arg.slice('--wait-ms='.length));
    else if (arg === '--resume') args.resume = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit must be a positive integer.');
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) throw new Error('--delay-ms must be non-negative.');
  if (!Number.isFinite(args.waitMs) || args.waitMs < 0) throw new Error('--wait-ms must be non-negative.');
  return args;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const contents = await readFile(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

function mongoUri() {
  return process.env.DEVLABS_MONGO_URI || process.env.ADMIN_MONGO_URI || process.env.MONGODB_URI;
}

function dbName(uri) {
  try {
    return new URL(uri).pathname.replace(/^\//, '') || 'devlabs';
  } catch {
    return 'devlabs';
  }
}

async function importRuntimePackage(packageName) {
  try {
    return await import(packageName);
  } catch (error) {
    const require = createRequire(import.meta.url);
    for (const binDir of String(process.env.PATH || '').split(path.delimiter)) {
      if (!binDir.endsWith(`${path.sep}node_modules${path.sep}.bin`)) continue;
      try {
        const resolved = require.resolve(packageName, { paths: [path.dirname(binDir)] });
        return await import(pathToFileURL(resolved).href);
      } catch {
        // Continue looking through npx/npm module roots.
      }
    }
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function artifactPath(outputDir, builderId) {
  return path.join(outputDir, `${builderId}.json`);
}

function candidateScore(builder) {
  const quality = Number(builder.profileQuality?.overallScore || 0);
  const completion = Number(builder.profileCompletion?.score || builder.profileCompletion?.profileScore || 0);
  const github = builder.links?.github || builder.integrations?.github?.username ? 18 : 0;
  const experience = Array.isArray(builder.experiences) && builder.experiences.length ? 12 : 0;
  const projectCount = Number(builder.projectCount || 0);
  const projects = Math.min(projectCount, 4) * 5;
  const skills = Math.min(Array.isArray(builder.skills) ? builder.skills.length : 0, 8);
  return quality * 2 + completion + github + experience + projects + skills;
}

async function selectBuilders(db, collection, limit) {
  const candidates = await collection
    .find(
      {
        'links.linkedin': { $type: 'string', $ne: '' },
        visibilityStatus: { $ne: 'hidden' },
      },
      {
        projection: {
          name: 1,
          'links.linkedin': 1,
          profileQuality: 1,
          profileCompletion: 1,
          'links.github': 1,
          'integrations.github.username': 1,
          experiences: 1,
          skills: 1,
        },
      }
    )
    .toArray();
  const projectCounts = await db
    .collection('projectrecords')
    .aggregate([{ $group: { _id: '$builderId', count: { $sum: 1 } } }])
    .toArray();
  const countsByBuilder = new Map(projectCounts.map((entry) => [String(entry._id), entry.count]));
  return candidates
    .map((builder) => ({ ...builder, projectCount: countsByBuilder.get(String(builder._id)) || 0 }))
    .filter((builder) => /linkedin\.com\/in\/[^/?#]+/i.test(String(builder.links?.linkedin || '')))
    .filter((builder) => candidateScore(builder) >= 45)
    .sort((a, b) => candidateScore(b) - candidateScore(a) || String(a._id).localeCompare(String(b._id)))
    .slice(0, limit);
}

async function fetchArtifact(builder, args) {
  const scraperUrl = (process.env.LINKEDIN_SCRAPER_URL || DEFAULT_SCRAPER_URL).replace(/\/+$/, '');
  const response = await fetch(`${scraperUrl}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_SCRAPER_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script: 'enrich-builder-linkedin-cdp.mjs',
      // The Railway browser service intentionally has no application MongoDB
      // connection. Extract by public LinkedIn URL, then bind the returned
      // artifact to the known local BuilderProfile before applying it.
      args: [
        '--linkedin-url',
        String(builder.links?.linkedin || ''),
        '--name',
        String(builder.name || 'LinkedIn user'),
        '--output-key',
        String(builder._id),
        '--wait-ms',
        String(args.waitMs),
      ],
    }),
    signal: AbortSignal.timeout(180000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Scraper returned HTTP ${response.status}`);
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFile('.dev.vars');
  await loadEnvFile('.env');
  const uri = mongoUri();
  if (!uri) throw new Error('Missing DEVLABS_MONGO_URI, ADMIN_MONGO_URI, or MONGODB_URI.');
  if (!process.env.LINKEDIN_SCRAPER_SECRET) throw new Error('Missing LINKEDIN_SCRAPER_SECRET.');
  await mkdir(args.outputDir, { recursive: true });

  const { MongoClient } = await importRuntimePackage('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName(uri));
    const collectionNames = await db.listCollections({}, { nameOnly: true }).toArray();
    const builders = db.collection(collectionNames.some((entry) => entry.name === 'builderprofiles') ? 'builderprofiles' : 'builderProfiles');
    const selected = await selectBuilders(db, builders, args.limit);
    if (args.dryRun) {
      console.log(JSON.stringify({
        selectedCount: selected.length,
        requestedLimit: args.limit,
        builders: selected.map((builder) => ({
          builderId: String(builder._id),
          name: builder.name,
          linkedin: builder.links?.linkedin,
          score: candidateScore(builder),
        })),
      }, null, 2));
      return;
    }
    const runPath = path.join(args.outputDir, `run-high-signal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const summary = {
      mode: 'remote-dry-run',
      selectedCount: selected.length,
      requestedLimit: args.limit,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      succeeded: 0,
      resumed: 0,
      failed: 0,
      extractedExperiences: 0,
      results: [],
    };

    for (const builder of selected) {
      const builderId = String(builder._id);
      const destination = artifactPath(args.outputDir, builderId);
      if (args.resume && existsSync(destination)) {
        summary.resumed += 1;
        summary.results.push({ builderId, name: builder.name, status: 'existing' });
        continue;
      }
      try {
        const payload = await fetchArtifact(builder, args);
        if (!payload?.artifact) throw new Error('Scraper returned no enrichment artifact.');
        payload.artifact.builder = {
          ...(payload.artifact.builder || {}),
          _id: builderId,
          existingProfile: { _id: builderId, name: builder.name, links: builder.links },
        };
        await writeFile(destination, `${JSON.stringify(payload.artifact, null, 2)}\n`, 'utf8');
        const count = Number(payload?.summary?.extractedExperienceCount || 0);
        summary.succeeded += 1;
        summary.extractedExperiences += count;
        summary.results.push({ builderId, name: builder.name, status: 'ok', experiences: count });
        console.log(JSON.stringify({ builderId, name: builder.name, status: 'ok', experiences: count }));
      } catch (error) {
        summary.failed += 1;
        summary.results.push({ builderId, name: builder.name, status: 'failed', error: String(error?.message || error) });
        console.error(JSON.stringify({ builderId, name: builder.name, status: 'failed', error: String(error?.message || error) }));
      }
      await writeFile(runPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      if (args.delayMs) await sleep(args.delayMs);
    }

    summary.finishedAt = new Date().toISOString();
    await writeFile(runPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      summaryPath: runPath,
      selectedCount: summary.selectedCount,
      succeeded: summary.succeeded,
      resumed: summary.resumed,
      failed: summary.failed,
      extractedExperiences: summary.extractedExperiences,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
