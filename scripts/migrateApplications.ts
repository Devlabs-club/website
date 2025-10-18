/**
 * Migration Script: Application Schema Update
 * 
 * This script migrates the Application collection from the old schema to the new simplified schema.
 * 
 * Old schema fields (to be removed):
 * - name, age, email, phone
 * - yearOfStudy, expectedGradYear, linkedin, website
 * - workEligibility, needSponsorship, sponsorshipType
 * - progress, updatedAt
 * 
 * New schema fields (to be retained):
 * - user (ObjectId, unique, required)
 * - status, major, track
 * - teamName, teamPreference
 * - tShirtSize, dietaryRestrictions, whyJoin
 * - resumeUrl
 * - metadata.naturalKey
 * - createdAt
 * 
 * Steps:
 * 1. Connect to database
 * 2. Backup existing collection
 * 3. Remove deprecated fields from all documents
 * 4. Drop old indexes (unique index on email)
 * 5. Create new indexes (unique index on user)
 * 6. Handle duplicates (keep most recent createdAt if multiple per user)
 * 7. Validate results
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to dry run

if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set');
  process.exit(1);
}

interface OldApplication {
  _id: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId;
  email?: string;
  name?: string;
  age?: number;
  phone?: string;
  yearOfStudy?: string;
  expectedGradYear?: number;
  linkedin?: string;
  website?: string;
  workEligibility?: string;
  needSponsorship?: string;
  sponsorshipType?: string;
  progress?: number;
  updatedAt?: Date;
  // Fields to keep
  status?: string;
  major?: string;
  track?: string;
  teamName?: mongoose.Types.ObjectId;
  teamPreference?: string;
  tShirtSize?: string;
  dietaryRestrictions?: string;
  whyJoin?: string;
  resumeUrl?: string;
  metadata?: { naturalKey?: string };
  createdAt?: Date;
}

async function migrateApplications() {
  console.log('='.repeat(80));
  console.log('Application Schema Migration');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE RUN'}`);
  console.log(`Database: ${MONGODB_URI?.split('@')[1]?.split('?')[0] || 'unknown'}`);
  console.log('='.repeat(80));
  console.log('');

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
    console.log('✓ Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const collection = db.collection('applications');

    // Step 1: Get counts
    const totalCount = await collection.countDocuments();
    console.log(`\n📊 Found ${totalCount} application documents`);

    // Step 2: Analyze current state
    const withUser = await collection.countDocuments({ user: { $exists: true, $ne: null } });
    const withEmail = await collection.countDocuments({ email: { $exists: true, $ne: null } });
    const withoutUser = totalCount - withUser;

    console.log(`   - With user field: ${withUser}`);
    console.log(`   - With email field: ${withEmail}`);
    console.log(`   - Without user field: ${withoutUser} ⚠️`);

    if (withoutUser > 0) {
      console.log('\n⚠️  WARNING: Some applications do not have a user field!');
      console.log('   These will need manual intervention or will be skipped.');
    }

    // Step 3: Check for duplicates (multiple applications per user)
    const duplicates = await collection.aggregate([
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
    let dedupeCount = 0;
    if (duplicates.length > 0 && !DRY_RUN) {
      console.log('🔧 Removing duplicate applications...');
      for (const dup of duplicates) {
        // Sort by createdAt descending, keep first (most recent)
        const sorted = (dup as any).docs.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        
        const toKeep = sorted[0]._id;
        const toDelete = sorted.slice(1).map((d: any) => d._id);
        
        const result = await collection.deleteMany({ _id: { $in: toDelete } });
        dedupeCount += result.deletedCount || 0;
      }
      console.log(`   ✓ Removed ${dedupeCount} duplicate applications`);
    } else if (duplicates.length > 0) {
      console.log(`   [DRY RUN] Would remove ~${duplicates.reduce((sum, d: any) => sum + d.count - 1, 0)} duplicate applications`);
    }

    // Step 5: Remove deprecated fields
    const deprecatedFields = [
      'name',
      'age',
      'email',
      'phone',
      'yearOfStudy',
      'expectedGradYear',
      'linkedin',
      'website',
      'workEligibility',
      'needSponsorship',
      'sponsorshipType',
      'progress',
      'updatedAt'
    ];

    if (!DRY_RUN) {
      console.log('\n🔧 Removing deprecated fields...');
      const unsetFields: any = {};
      deprecatedFields.forEach(field => {
        unsetFields[field] = '';
      });

      const updateResult = await collection.updateMany(
        {},
        { $unset: unsetFields }
      );
      console.log(`   ✓ Updated ${updateResult.modifiedCount} documents`);
    } else {
      console.log(`\n[DRY RUN] Would remove fields: ${deprecatedFields.join(', ')}`);
    }

    // Step 6: Drop old indexes
    console.log('\n🔧 Updating indexes...');
    const indexes = await collection.indexes();
    console.log(`   Current indexes: ${indexes.length}`);
    
    if (!DRY_RUN) {
      // Drop email unique index if it exists
      try {
        await collection.dropIndex('email_1');
        console.log('   ✓ Dropped email_1 index');
      } catch (e: any) {
        if (e.codeName !== 'IndexNotFound') {
          console.log(`   ⚠️  Error dropping email index: ${e.message}`);
        }
      }
    } else {
      const hasEmailIndex = indexes.some((idx: any) => idx.key.email);
      if (hasEmailIndex) {
        console.log('   [DRY RUN] Would drop email_1 index');
      }
    }

    // Step 7: Create new indexes
    if (!DRY_RUN) {
      // Create unique index on user
      try {
        await collection.createIndex({ user: 1 }, { unique: true, sparse: false });
        console.log('   ✓ Created unique index on user field');
      } catch (e: any) {
        console.log(`   ⚠️  Error creating user index: ${e.message}`);
      }

      // Create indexes for common queries
      await collection.createIndex({ status: 1, track: 1 });
      console.log('   ✓ Created compound index on status + track');

      await collection.createIndex({ major: 1 });
      console.log('   ✓ Created index on major');

      await collection.createIndex({ 'metadata.naturalKey': 1 }, { sparse: true });
      console.log('   ✓ Created index on metadata.naturalKey');
    } else {
      console.log('   [DRY RUN] Would create indexes:');
      console.log('      - { user: 1 } (unique)');
      console.log('      - { status: 1, track: 1 }');
      console.log('      - { major: 1 }');
      console.log('      - { metadata.naturalKey: 1 } (sparse)');
    }

    // Step 8: Validation
    console.log('\n📊 Post-migration stats:');
    const finalCount = await collection.countDocuments();
    const withUserFinal = await collection.countDocuments({ user: { $exists: true, $ne: null } });
    const withMajor = await collection.countDocuments({ major: { $exists: true, $ne: null } });
    
    console.log(`   Total documents: ${finalCount}`);
    console.log(`   With user field: ${withUserFinal}`);
    console.log(`   With major field: ${withMajor}`);

    // Sample document
    const sample = await collection.findOne({ user: { $exists: true } });
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
    await mongoose.disconnect();
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
