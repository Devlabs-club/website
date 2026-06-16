/**
 * Verify a sample of recently queue-enriched builders.
 *
 *   bun run scripts/verify-enrichment-queue-sample.ts id1,id2,...
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import BuilderProfile from '../src/models/talent/BuilderProfile';
import ProjectRecord from '../src/models/talent/ProjectRecord';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });

async function main() {
  const ids = (process.argv[2] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) throw new Error('Pass comma-separated builder IDs');

  await mongoose.connect(process.env.MONGODB_URI!);

  for (const id of ids) {
    const builder = await BuilderProfile.findById(id).lean();
    if (!builder) {
      console.log(id, 'NOT FOUND');
      continue;
    }
    const projects = await ProjectRecord.find({ builderId: id }).lean();
    console.log(
      JSON.stringify(
        {
          id,
          name: builder.name,
          email: builder.email,
          headline: builder.headline || null,
          bioLen: (builder.bio || '').length,
          skills: (builder.rolePreference || []).slice(0, 8),
          projectCount: projects.length,
          updatedAt: builder.updatedAt,
        },
        null,
        2
      )
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
