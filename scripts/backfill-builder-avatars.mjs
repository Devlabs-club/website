#!/usr/bin/env node
/**
 * Backfill BuilderProfile.avatarUrl through a logged-in local Chrome CDP session.
 *
 * Defaults to dry-run. It never overwrites an existing avatar, uses the existing
 * CDP DOM photo scorer in enrich-builder-linkedin-cdp.mjs, and aborts when the
 * LinkedIn session repeatedly appears unavailable.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ARTIFACT_DIR = '.context/linkedin-enrichment';
const STATE_FILE = '.context/avatar-backfill/state.json';

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: 20,
    offset: 0,
    delayMs: 8000,
    jitterMs: 2000,
    waitMs: 8000,
    cdpUrl: process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222',
    resume: false,
    highSignal: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--resume') args.resume = true;
    else if (arg === '--high-signal') args.highSignal = true;
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8));
    else if (arg === '--offset') args.offset = Number(argv[++index]);
    else if (arg.startsWith('--offset=')) args.offset = Number(arg.slice(9));
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++index]);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.slice(11));
    else if (arg === '--jitter-ms') args.jitterMs = Number(argv[++index]);
    else if (arg.startsWith('--jitter-ms=')) args.jitterMs = Number(arg.slice(12));
    else if (arg === '--wait-ms') args.waitMs = Number(argv[++index]);
    else if (arg.startsWith('--wait-ms=')) args.waitMs = Number(arg.slice(10));
    else if (arg === '--cdp-url') args.cdpUrl = argv[++index];
    else if (arg.startsWith('--cdp-url=')) args.cdpUrl = arg.slice(10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
    throw new Error('--limit must be an integer from 1 to 50.');
  }
  if (!Number.isInteger(args.offset) || args.offset < 0) throw new Error('--offset must be a non-negative integer.');
  return args;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = await readFile(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'pipe', env: process.env });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(output) : reject(new Error(output.slice(-1200))));
  });
}

function validLinkedInPhoto(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' && /(^|\.)licdn\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFile('.dev.vars');
  await loadEnvFile('.env');
  const uri = mongoUri();
  if (!uri) throw new Error('Missing DEVLABS_MONGO_URI, ADMIN_MONGO_URI, or MONGODB_URI.');

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const db = client.db(dbName(uri));
  const names = await db.listCollections({}, { nameOnly: true }).toArray();
  const builders = db.collection(names.some((row) => row.name === 'builderprofiles') ? 'builderprofiles' : 'builderProfiles');
  const users = names.some((row) => row.name === 'users') ? db.collection('users') : null;
  const missingAvatarQuery = {
    'links.linkedin': { $nin: [null, ''] },
    $or: [{ avatarUrl: null }, { avatarUrl: '' }, { avatarUrl: { $exists: false } }],
  };
  const projectCollectionName = names.some((row) => row.name === 'projectrecords')
    ? 'projectrecords'
    : 'projectRecords';
  const selected = args.highSignal
    ? await builders.aggregate([
        { $match: missingAvatarQuery },
        {
          $lookup: {
            from: projectCollectionName,
            localField: '_id',
            foreignField: 'builderId',
            as: 'projects',
          },
        },
        {
          $addFields: {
            projectCount: { $size: '$projects' },
            hasGithubEvidence: {
              $or: [
                { $ne: ['$links.github', null] },
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$projects',
                          as: 'project',
                          cond: { $ne: ['$$project.links.github', null] },
                        },
                      },
                    },
                    0,
                  ],
                },
              ],
            },
          },
        },
        {
          $match: {
            'profileQuality.overallScore': { $gte: 70 },
            projectCount: { $gte: 2 },
            hasGithubEvidence: true,
          },
        },
        { $sort: { 'profileQuality.overallScore': -1, 'profileCompletion.proofScore': -1, updatedAt: -1 } },
        { $skip: args.offset },
        { $limit: args.limit },
        { $project: { _id: 1, name: 1, email: 1, 'links.linkedin': 1 } },
      ]).toArray()
    : await builders
        .find(missingAvatarQuery, { projection: { _id: 1, name: 1, email: 1, 'links.linkedin': 1 } })
        .sort({ updatedAt: 1 })
        .skip(args.offset)
        .limit(args.limit)
        .toArray();
  const results = [];
  let authFailures = 0;

  try {
    for (const builder of selected) {
      const builderId = String(builder._id);
      const artifactPath = path.join(ARTIFACT_DIR, `${builderId}.json`);
      try {
        if (!(args.resume && existsSync(artifactPath))) {
          await runNode([
            'scripts/enrich-builder-linkedin-cdp.mjs',
            `--builderId=${builderId}`,
            '--photo-only',
            `--wait-ms=${args.waitMs}`,
            `--cdp-url=${args.cdpUrl}`,
          ]);
        }
        const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
        const photo = artifact?.extracted?.cdpExtraction?.photo?.imageUrl
          || artifact?.proposedMongoUpdate?.$set?.avatarUrl
          || null;
        const warning = String(artifact?.extracted?.cdpExtraction?.warning || '');
        if (/authwall|sign in|log in|checkpoint/i.test(warning)) authFailures += 1;
        if (!validLinkedInPhoto(photo)) {
          results.push({ builderId, name: builder.name, status: 'skipped', reason: warning || 'no_valid_linkedin_photo' });
        } else if (args.apply) {
          const update = await builders.updateOne(
            { _id: builder._id, $or: [{ avatarUrl: null }, { avatarUrl: '' }, { avatarUrl: { $exists: false } }] },
            { $set: { avatarUrl: photo } }
          );
          if (update.modifiedCount && users && builder.email) {
            await users.updateOne(
              { email: String(builder.email).toLowerCase(), $or: [{ avatarUrl: null }, { avatarUrl: '' }, { avatarUrl: { $exists: false } }] },
              { $set: { avatarUrl: photo } }
            );
          }
          results.push({ builderId, name: builder.name, status: update.modifiedCount ? 'updated' : 'skipped', photo });
        } else {
          results.push({ builderId, name: builder.name, status: 'would_update', photo });
        }
      } catch (error) {
        results.push({ builderId, name: builder.name, status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
      if (authFailures >= 2) {
        results.push({ status: 'aborted', reason: 'two_authwall_failures' });
        break;
      }
      await sleep(args.delayMs + Math.floor(Math.random() * args.jitterMs));
    }
  } finally {
    await client.close();
  }

  const report = {
    mode: args.apply ? 'apply' : 'dry-run',
    selection: args.highSignal
      ? 'profileQuality >=70, at least two projects, and public GitHub evidence'
      : 'all builders missing an avatar',
    cdpUrl: args.cdpUrl,
    selected: selected.length,
    results,
    finishedAt: new Date().toISOString(),
  };
  const reportPath = path.join(path.dirname(STATE_FILE), `report-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
  if (results.some((result) => result.status === 'aborted')) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
