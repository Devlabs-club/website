#!/usr/bin/env tsx
import mongoose from 'mongoose';
import { connectAdminDB } from '../src/lib/mongodb';
import { backfillTalentSearchIndex } from '../src/lib/talent/searchIndex';

function parseArgs(argv: string[]) {
  const args: { limit?: number; batchSize?: number } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--batch-size') args.batchSize = Number(argv[++i]);
    else if (arg.startsWith('--batch-size=')) args.batchSize = Number(arg.slice('--batch-size='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const startedAt = Date.now();
try {
  const args = parseArgs(process.argv.slice(2));
  await connectAdminDB();
  const result = await backfillTalentSearchIndex(args);
  console.info('[talent-search-index] backfill:done', {
    ...result,
    durationMs: Date.now() - startedAt,
  });
} catch (error) {
  console.error('[talent-search-index] backfill:error', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
