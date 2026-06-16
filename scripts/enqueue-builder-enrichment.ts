/**
 * Enqueue builder enrichment jobs to Cloudflare Queues.
 *
 *   bun run enqueue:enrichment -- --limit 10          # test sample
 *   bun run enqueue:enrichment -- --all             # remaining pool
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import { listRemainingBuilderIds } from './lib/enrichment-queue-targets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });

function parseArgs(argv: string[]) {
  const args = { limit: 10, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--limit') args.limit = Number(argv[++i] || 10);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = process.env.ENRICHMENT_INTERNAL_SECRET?.trim();
  const workerUrl = (
    process.env.ENRICHMENT_WORKER_URL || 'https://builder-enrichment.plain-fire-9ab3.workers.dev'
  ).replace(/\/$/, '');

  if (!secret) {
    throw new Error('Set ENRICHMENT_INTERNAL_SECRET in .dev.vars');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const remaining = await listRemainingBuilderIds({ rootDir: join(__dirname, '..') });
  await mongoose.disconnect();

  const targets = args.all ? remaining : remaining.slice(0, args.limit);
  console.log(`[enqueue] remaining=${remaining.length} sending=${targets.length} worker=${workerUrl}`);

  if (!targets.length) {
    console.log('[enqueue] nothing to send');
    return;
  }

  const res = await fetch(`${workerUrl}/enqueue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ builderIds: targets.map((t) => t.id) }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[enqueue] failed', res.status, payload);
    process.exit(1);
  }

  console.log('[enqueue] ok', payload);
  console.log(
    '[enqueue] sample:',
    targets.slice(0, 5).map((t) => `${t.name} <${t.email}>`).join(', ')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
