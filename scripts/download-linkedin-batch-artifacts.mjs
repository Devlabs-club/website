#!/usr/bin/env node
/** Download persistent Railway batch artifacts for local MongoDB apply + embedding. */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SCRAPER_URL = 'https://enrich-scraper-production.up.railway.app';

function scraperBaseUrl() {
  const configured = (process.env.LINKEDIN_SCRAPER_URL || DEFAULT_SCRAPER_URL).replace(/\/+$/, '');
  // Retain compatibility with the old, misspelled endpoint stored in local env.
  return configured.includes('rich-scraper-production.up.railway.app')
    ? DEFAULT_SCRAPER_URL
    : configured;
}

function parseArgs(argv) {
  const args = { batchId: null, outputDir: null, allowPartial: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--batch-id') args.batchId = argv[++index];
    else if (arg.startsWith('--batch-id=')) args.batchId = arg.slice('--batch-id='.length);
    else if (arg === '--output-dir') args.outputDir = argv[++index];
    else if (arg.startsWith('--output-dir=')) args.outputDir = arg.slice('--output-dir='.length);
    else if (arg === '--allow-partial') args.allowPartial = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.batchId) throw new Error('--batch-id is required.');
  args.outputDir ||= `.context/linkedin-enrichment/${args.batchId}`;
  return args;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of (await readFile(filePath, 'utf8')).split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function apiRequest(pathname) {
  const url = `${scraperBaseUrl()}${pathname}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.LINKEDIN_SCRAPER_SECRET}` } });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { throw new Error(`Invalid JSON from ${pathname}: ${text.slice(0, 200)}`); }
  if (!response.ok) throw new Error(payload?.message || payload?.error || `HTTP ${response.status} for ${pathname}`);
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvFile('.dev.vars');
  await loadEnvFile('.env');
  if (!process.env.LINKEDIN_SCRAPER_SECRET) throw new Error('Missing LINKEDIN_SCRAPER_SECRET.');

  const batch = await apiRequest(`/batches/${encodeURIComponent(args.batchId)}`);
  if (batch.status !== 'completed' && !args.allowPartial) {
    throw new Error(`Batch is ${batch.status}; wait for completion or pass --allow-partial.`);
  }
  await mkdir(args.outputDir, { recursive: true });

  const completed = (batch.items || []).filter((item) => item.status === 'succeeded' && item.artifactFile);
  for (const item of completed) {
    const artifact = await apiRequest(`/batches/${encodeURIComponent(args.batchId)}/artifacts/${encodeURIComponent(item.builderId)}`);
    await writeFile(path.join(args.outputDir, `${item.builderId}.json`), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  }
  await writeFile(path.join(args.outputDir, 'batch-summary.json'), `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    batchId: args.batchId,
    batchStatus: batch.status,
    downloaded: completed.length,
    failed: (batch.items || []).filter((item) => item.status === 'failed').length,
    outputDir: args.outputDir,
    next: [
      `node scripts/apply-linkedin-enrichment.mjs --artifacts-dir ${args.outputDir}`,
      `node scripts/backfill-targeted-talent-embeddings.mjs --linkedin-dir ${args.outputDir} --no-attachment --delay-ms 100`,
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
