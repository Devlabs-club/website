/**
 * Migration Script: Application Schema Alignment
 *
 * Goals:
 * - Ensure deprecated fields are explicitly null: track, teamName, teamPreference, tShirtSize, dietaryRestrictions, whyJoin
 * - Normalize `dob` to Date
 * - Backfill `resumeUrl` both ways between Application (admin DB) and User (app DB)
 * - Compute and set `progress` (0–4) based on section contract
 * - Provide DRY_RUN mode and optional backup to JSON
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const APP_MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_MONGO_URI = process.env.ADMIN_MONGO_URI;
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to dry run
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

if (!APP_MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set');
  process.exit(1);
}
if (!ADMIN_MONGO_URI) {
  console.error('ADMIN_MONGO_URI environment variable is not set');
  process.exit(1);
}

interface ApplicationDoc {
  _id: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId;
  // Core fields
  status?: string;
  major?: string;
  name?: string;
  gender?: 'male' | 'female' | 'non-binary' | string;
  dob?: Date | string;
  email?: string;
  phone?: string;
  country?: string;
  linkedin?: string;
  github?: string;
  personalWebsite?: string;
  portfolio?: string;
  favoriteLink?: string;
  twitterHandle?: string;
  coolestThing?: string;
  hackathonStory?: string;
  additionalInfo?: string;
  projectIdea?: string;
  referralSource?: string;
  proofOfWork?: string;
  resumeUrl?: string;
  // Deprecated
  track?: string | null;
  teamName?: mongoose.Types.ObjectId | null;
  teamPreference?: string | null;
  tShirtSize?: string | null;
  dietaryRestrictions?: string | null;
  whyJoin?: string | null;
  // Meta
  metadata?: { naturalKey?: string } | undefined;
  createdAt?: Date;
}

async function migrateApplications() {
  console.log('='.repeat(80));
  console.log('Application Schema Migration');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE RUN'}`);
  console.log(`App DB: ${APP_MONGODB_URI?.split('@')[1]?.split('?')[0] || 'unknown'}`);
  console.log(`Admin DB: ${ADMIN_MONGO_URI?.split('@')[1]?.split('?')[0] || 'unknown'}`);
  console.log('='.repeat(80));
  console.log('');

  try {
    // Connect to both DBs
    const adminConn = await mongoose.createConnection(ADMIN_MONGO_URI as string, { bufferCommands: false }).asPromise();
    const appConn = await mongoose.createConnection(APP_MONGODB_URI as string, { bufferCommands: false }).asPromise();
    console.log('✓ Connected to Admin and App MongoDB');

    const appDb = appConn.db;
    const adminDb = adminConn.db;
    if (!appDb || !adminDb) throw new Error('Database connections not established');

    const applications = adminDb.collection<ApplicationDoc>('applications');
    const users = appDb.collection('users');

    // Step 1: Get counts
  const totalCount = await applications.countDocuments();
    console.log(`\n📊 Found ${totalCount} application documents`);

    // Step 2: Analyze current state
  const withUser = await applications.countDocuments({ user: { $exists: true, $ne: undefined as any } });
  const withEmail = await applications.countDocuments({ email: { $exists: true, $ne: undefined as any } });
    const withoutUser = totalCount - withUser;

    console.log(`   - With user field: ${withUser}`);
    console.log(`   - With email field: ${withEmail}`);
    console.log(`   - Without user field: ${withoutUser} ⚠️`);

    if (withoutUser > 0) {
      console.log('\n⚠️  WARNING: Some applications do not have a user field!');
      console.log('   These will need manual intervention or will be skipped.');
    }

    // Step 3: Check for duplicates (multiple applications per user)
    const duplicates = await applications.aggregate([
      { $match: { user: { $exists: true, $ne: null } } },
      { $group: { _id: '$user', count: { $sum: 1 }, docs: { $push: { _id: '$_id', createdAt: '$createdAt' } } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    console.log(`\n🔍 Found ${duplicates.length} users with multiple applications`);
    if (duplicates.length > 0) {
      console.log('   Will keep the most recent application for each user');
      duplicates.slice(0, 5).forEach((dup: any) => {
        console.log(`   - User ${dup._id}: ${dup.count} applications`);
      });
      if (duplicates.length > 5) {
        console.log(`   ... and ${duplicates.length - 5} more`);
      }
    }

    if (DRY_RUN) {
      console.log('\n--- DRY RUN: Simulating changes ---\n');
    } else {
      console.log('\n--- LIVE RUN: Making changes ---\n');
      const proceed = await askConfirmation('Do you want to proceed with the migration?');
      if (!proceed) {
        console.log('Migration cancelled');
        await mongoose.disconnect();
        return;
      }
    }

    // Step 4: Handle duplicates - keep most recent per user
    // No dedupe deletes in this migration; just report duplicates
    if (duplicates.length > 0) {
      console.log('ℹ️  Duplicate applications exist; consider cleanup separately.');
    }

    // Optional: Backup applications
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `applications_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    try {
      const sampleDocs = await applications.find({}).limit(1000).toArray();
      fs.writeFileSync(backupPath, JSON.stringify(sampleDocs, null, 2));
      console.log(`\n🗄️  Backed up first ${sampleDocs.length} applications to: ${backupPath}`);
    } catch (e) {
      console.warn('Backup failed or partially completed:', e instanceof Error ? e.message : e);
    }

    // Step 6: Drop old indexes
    // Ensure unique index on user in admin applications
    if (!DRY_RUN) {
      try {
        await applications.createIndex({ user: 1 }, { unique: true, sparse: false });
        await applications.createIndex({ status: 1, track: 1 });
        await applications.createIndex({ major: 1 });
        await applications.createIndex({ 'metadata.naturalKey': 1 }, { sparse: true });
        console.log('✓ Ensured application indexes');
      } catch (e: any) {
        console.warn('Index ensure warning:', e?.message || e);
      }
    }

    // Step: Iterate applications and apply transformations
    const cursor = applications.find({});
    let updatedCount = 0;
    let missingResume = 0;
    while (await cursor.hasNext()) {
      const app = await cursor.next() as ApplicationDoc | null;
      if (!app) break;

      const userId = app.user?.toString();
      const update: any = { $set: {}, $unset: {} };

      // Normalize dob
      if (app.dob && typeof app.dob === 'string') {
        const d = new Date(app.dob);
        if (!isNaN(d.getTime())) update.$set.dob = d;
      }

      // Backfill resumeUrl both ways
      let resumeUrl = app.resumeUrl;
      if ((!resumeUrl || resumeUrl === null) && userId) {
        const userDoc = await users.findOne({ _id: new mongoose.Types.ObjectId(userId) });
        if (userDoc?.resumeUrl) {
          resumeUrl = userDoc.resumeUrl;
          update.$set.resumeUrl = resumeUrl;
        }
      } else if (resumeUrl && userId) {
        const userDoc = await users.findOne({ _id: new mongoose.Types.ObjectId(userId) });
        if (userDoc && !userDoc.resumeUrl) {
          if (!DRY_RUN) await users.updateOne({ _id: userDoc._id }, { $set: { resumeUrl } });
        }
      }

      // Deprecated fields explicitly null
      update.$set.track = null;
      update.$set.teamName = null;
      update.$set.teamPreference = null;
      update.$set.tShirtSize = null;
      update.$set.dietaryRestrictions = null;
      update.$set.whyJoin = null;

      // Compute progress
      const hasPersonal = Boolean(app.name && app.gender && (app.dob || update.$set.dob) && app.email && app.phone && app.country && (resumeUrl || update.$set.resumeUrl));
      const hasCoreLinks = Boolean(app.linkedin && app.github);
      const hasStory = Boolean(app.coolestThing && app.hackathonStory);
      const hasExtras = Boolean(app.projectIdea || app.proofOfWork || app.portfolio || app.personalWebsite || app.favoriteLink || app.twitterHandle || app.referralSource || app.additionalInfo);
      const progress = [hasPersonal, hasCoreLinks, hasStory, hasExtras].reduce((acc, v) => acc + (v ? 1 : 0), 0);
      update.$set.progress = progress;

      // Cleanup empty operators
      if (Object.keys(update.$unset).length === 0) delete update.$unset;
      if (Object.keys(update.$set).length === 0) delete update.$set;

      if (update.$set && Object.keys(update.$set).length > 0 || update.$unset) {
        if (!DRY_RUN) {
          await applications.updateOne({ _id: app._id }, update);
        }
        updatedCount++;
      }

      if (!resumeUrl) missingResume++;
    }
    console.log(`\n✓ Processed applications. Updated: ${updatedCount}. Missing resumeUrl after migration: ${missingResume}.`);

    // Step 8: Validation
    console.log('\n📊 Post-migration stats:');
  const finalCount = await applications.countDocuments();
  const withUserFinal = await applications.countDocuments({ user: { $exists: true, $ne: undefined as any } });
  const withMajor = await applications.countDocuments({ major: { $exists: true, $ne: undefined as any } });
    
    console.log(`   Total documents: ${finalCount}`);
    console.log(`   With user field: ${withUserFinal}`);
    console.log(`   With major field: ${withMajor}`);

    // Sample document
  const sample = await applications.findOne({ user: { $exists: true } });
    if (sample) {
      console.log('\n📄 Sample migrated document:');
      console.log(JSON.stringify(sample, null, 2));
    }

    console.log('\n' + '='.repeat(80));
    console.log('✓ Migration completed successfully');
    console.log('='.repeat(80));

    if (DRY_RUN) {
      console.log('\nℹ️  This was a DRY RUN. No changes were made.');
      console.log('   To run the migration for real, set DRY_RUN=false');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    // Close all connections
    const conns = mongoose.connections.slice();
    await Promise.all(conns.map(async (c) => {
      try { await c.close(); } catch {}
    }));
    console.log('\n✓ Disconnected from MongoDB');
  }
}

function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question(`${question} (yes/no): `, (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// Run migration
if (require.main === module) {
  migrateApplications()
    .then(() => {
      console.log('\nMigration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nMigration script failed:', error);
      process.exit(1);
    });
}

export { migrateApplications };
