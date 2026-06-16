import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';
import { enrichBuilderProfile } from '../src/lib/talent/builderEnrichment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.dev.vars'), override: true });

const PILOT_IDS = (process.env.PILOT_BUILDER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SOURCES = (process.env.PILOT_SOURCES || 'resume,github,devpost,linkedin,portfolio')
  .split(',')
  .map((s) => s.trim()) as import('../src/lib/talent/builderEnrichment').EnrichmentSource[];

async function main() {
  if (!PILOT_IDS.length) throw new Error('Set PILOT_BUILDER_IDS=id1,id2,...');
  await mongoose.connect(process.env.MONGODB_URI!);

  for (const builderId of PILOT_IDS) {
    console.log(`\n[pilot] enriching ${builderId} ...`);
    const t0 = Date.now();
    try {
      const result = await enrichBuilderProfile({
        builderId,
        sources: [...SOURCES],
        dryRun: false,
      });
      console.log(
        `[pilot:ok] ${builderId} | fields=${result.profileFieldsUpdated.join(',') || 'none'} | projects created=${result.projectsCreated} updated=${result.projectsUpdated} | ${Math.round((Date.now() - t0) / 1000)}s`
      );
      for (const s of result.sources) {
        if (s.errors?.length) console.log(`  ${s.source} errors: ${s.errors.join('; ')}`);
        if (s.meta) console.log(`  ${s.source} meta: ${JSON.stringify(s.meta)}`);
      }
    } catch (err) {
      console.error(`[pilot:fail] ${builderId}`, err instanceof Error ? err.message : err);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
