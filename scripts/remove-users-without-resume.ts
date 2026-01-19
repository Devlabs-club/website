import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Connection string
const BASE_URI = 'mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net';
const DEVLABS_DB = 'devlabs';
const DEVLABS_URI = `${BASE_URI}/${DEVLABS_DB}?retryWrites=true&w=majority&appName=Cluster0`;

async function removeUsersWithoutResume() {
  let devlabsConn: mongoose.Connection | null = null;

  try {
    console.log('🔄 Starting removal of users without resumeUrl...\n');

    // Connect to devlabs database
    console.log(`📡 Connecting to ${DEVLABS_DB} database...`);
    devlabsConn = await mongoose.createConnection(DEVLABS_URI).asPromise();
    console.log(`✅ Connected to ${DEVLABS_DB}\n`);

    const usersCollection = devlabsConn.db?.collection('users');
    
    if (!usersCollection) {
      throw new Error('Failed to get users collection from devlabs database');
    }

    // Count total users before deletion
    const totalUsersBefore = await usersCollection.countDocuments({});
    console.log(`📊 Total users in database: ${totalUsersBefore}\n`);

    // Find users without resumeUrl
    // This includes: null, undefined, empty string, or missing field
    console.log('🔍 Finding users without resumeUrl...');
    const usersWithoutResume = await usersCollection.find({
      $or: [
        { resumeUrl: { $exists: false } },
        { resumeUrl: null },
        { resumeUrl: '' },
        { resumeUrl: { $eq: undefined } }
      ]
    }).toArray();

    const countWithoutResume = usersWithoutResume.length;
    console.log(`   Found ${countWithoutResume} users without resumeUrl\n`);

    if (countWithoutResume === 0) {
      console.log('✅ No users without resumeUrl found. Nothing to delete.\n');
      return;
    }

    // Show sample of users to be deleted (first 10)
    if (countWithoutResume > 0) {
      console.log('📋 Sample of users to be deleted (first 10):');
      usersWithoutResume.slice(0, 10).forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email || 'No email'} (${user.fullName || user.name || 'No name'})`);
      });
      if (countWithoutResume > 10) {
        console.log(`   ... and ${countWithoutResume - 10} more\n`);
      } else {
        console.log();
      }
    }

    // Get user IDs to delete
    const userIdsToDelete = usersWithoutResume.map(user => user._id);

    // Delete users without resumeUrl
    console.log('🗑️  Deleting users without resumeUrl...');
    const deleteResult = await usersCollection.deleteMany({
      _id: { $in: userIdsToDelete }
    });

    // Count total users after deletion
    const totalUsersAfter = await usersCollection.countDocuments({});

    // Print summary
    console.log('\n═══════════════════════════════════════');
    console.log('  DELETION SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`  Total users before: ${totalUsersBefore}`);
    console.log(`  Users without resumeUrl: ${countWithoutResume}`);
    console.log(`  Users deleted: ${deleteResult.deletedCount}`);
    console.log(`  Total users after: ${totalUsersAfter}`);
    console.log('═══════════════════════════════════════\n');

    console.log('✅ Removal completed successfully!');

  } catch (error) {
    console.error('❌ Error during removal:', error);
    process.exit(1);
  } finally {
    if (devlabsConn) {
      await devlabsConn.close();
      console.log(`\n🔌 Closed ${DEVLABS_DB} connection`);
    }
  }
}

// Run the removal
removeUsersWithoutResume();

