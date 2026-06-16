/**
 * Backfill TalentEmbedding docs for builder profiles and projects.
 *
 *   bun run embeddings:backfill -- --limit 50
 *   bun run embeddings:backfill -- --builder-id <mongoId>
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';
import TalentEmbedding from '../src/models/talent/TalentEmbedding';
import { hasEmbeddingConfig } from '../src/lib/talent/embeddings/embedTalentEntity';
import {
  upsertBuilderEmbedding,
  upsertProjectEmbedding,
} from '../src/lib/talent/embeddings/upsertTalentEmbedding';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });
dotenv.config({ path: join(__dirname, '../.env') });

function parseArgs(argv: string[]) {
  return {
    limit: Number(argv.find((_, i, a) => a[i - 1] === '--limit') || 0) || 0,
    builderId: argv.find((_, i, a) => a[i - 1] === '--builder-id') || null,
    sleepMs: Number(argv.find((_, i, a) => a[i - 1] === '--sleep-ms') || 200) || 200,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!hasEmbeddingConfig()) {
    throw new Error('OPENROUTER_API_KEY (or OPENAI_API_KEY) required for embeddings');
  }

  const args = parseArgs(process.argv.slice(2));
  await mongoose.connect(process.env.MONGODB_URI!);

  let builders: any[];
  if (args.builderId) {
    const one = await BuilderProfile.findById(args.builderId).lean();
    if (!one) throw new Error(`Builder not found: ${args.builderId}`);
    builders = [one];
  } else {
    const query = { verificationStatus: { $ne: 'rejected' } };
    let q = BuilderProfile.find(query).sort({ updatedAt: -1 }).lean();
    if (args.limit > 0) q = q.limit(args.limit);
    builders = await q;
  }

  console.log(`[embeddings:backfill] ${builders.length} builders`);

  let profileOk = 0;
  let projectOk = 0;
  let failed = 0;

  for (const builder of builders) {
    const builderId = String(builder._id);
    const projects = await ProjectRecord.find({ builderId: builder._id }).lean();

    try {
      const profileSaved = await upsertBuilderEmbedding({ builderId, builder, projects });
      if (profileSaved) profileOk += 1;
      else failed += 1;

      for (const project of projects) {
        const saved = await upsertProjectEmbedding({
          projectId: String(project._id),
          builderId,
          project,
        });
        if (saved) projectOk += 1;
        if (args.sleepMs > 0) await sleep(args.sleepMs);
      }

      console.log(
        `[ok] ${builder.name} | profile=${profileSaved ? 'yes' : 'no'} | projects=${projects.length}`
      );
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${builder.name}`, err instanceof Error ? err.message : err);
    }

    if (args.sleepMs > 0) await sleep(args.sleepMs);
  }

  const totalEmbeddings = await TalentEmbedding.countDocuments({});
  console.log(
    `[embeddings:backfill] done profiles=${profileOk} projects=${projectOk} failed=${failed} totalDocs=${totalEmbeddings}`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
