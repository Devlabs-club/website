/**
 * Drop successIn30Days from all Opportunity documents.
 *
 * Usage:
 *   bun run scripts/remove-success-in-30-days-field.ts
 *   bun run scripts/remove-success-in-30-days-field.ts --dry-run
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Opportunity from '../src/models/talent/Opportunity';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const ADMIN_MONGO_URI = process.env.ADMIN_MONGO_URI;
if (!ADMIN_MONGO_URI) {
  console.error('ADMIN_MONGO_URI is not set');
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(ADMIN_MONGO_URI as string);

  const withField = await Opportunity.countDocuments({ successIn30Days: { $exists: true } });
  console.log(`Opportunities with successIn30Days field: ${withField}${dryRun ? ' (dry run)' : ''}`);

  if (dryRun) {
    await mongoose.disconnect();
    return;
  }

  const result = await Opportunity.updateMany(
    { successIn30Days: { $exists: true } },
    { $unset: { successIn30Days: '' } }
  );

  console.log(`Unset successIn30Days on ${result.modifiedCount} document(s).`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
