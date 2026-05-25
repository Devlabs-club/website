import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Connection strings
const TEST_URI = 'mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/test';
const DEVLABS_URI = 'mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/devlabs';

// Define schemas for the test database
const testUserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  major: { type: String, default: null },
  resumeUrl: { type: String, default: null },
  oauthProvider: { type: String, default: null },
  oauthId: { type: String, default: null },
  coolestThing: { type: String, default: null },
  hackathonStory: { type: String, default: null },
additionalInfo: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  __v: { type: Number, default: 0 }
}, { strict: false });

const testApplicationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
  name: { type: String, required: true },
  age: { type: Number, required: true },
  phone: { type: String, required: true },
  major: { type: String, required: true },
  yearOfStudy: { type: String, enum: ["Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"], required: true },
  expectedGradYear: { type: Number, required: true },
  linkedin: { type: String, required: true },
  github: { type: String },
  website: { type: String },
  workEligibility: { type: String, enum: ["Yes", "No"], required: true },
  needSponsorship: { type: String, enum: ["Yes", "No"], required: true },
  sponsorshipType: { type: String },
  resumeUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  toJSON: { getters: true },
  toObject: { getters: true }
});

async function migrateData() {
  let testConn: mongoose.Connection | null = null;
  let devlabsConn: mongoose.Connection | null = null;

  try {
    console.log('🔄 Starting migration from test to devlabs database...\n');

    // Connect to test database
    console.log('📡 Connecting to test database...');
    testConn = await mongoose.createConnection(TEST_URI).asPromise();
    console.log('✅ Connected to test\n');

    // Connect to devlabs database
    console.log('📡 Connecting to devlabs database...');
    devlabsConn = await mongoose.createConnection(DEVLABS_URI).asPromise();
    console.log('✅ Connected to devlabs\n');

    // Get collections from test database
    const testUsers = testConn.db?.collection('users');
    const testApplications = testConn.db?.collection('applications');

    if (!testUsers || !testApplications) {
      throw new Error('Failed to get collections from test database');
    }

    // Get collections from devlabs database
    const devlabsUsers = devlabsConn.db?.collection('users');
    const devlabsApplications = devlabsConn.db?.collection('applications');

    if (!devlabsUsers || !devlabsApplications) {
      throw new Error('Failed to get collections from devlabs database');
    }

    // Clear devlabs collections
    console.log('🗑️  Clearing devlabs database...');
    const usersDeleteResult = await devlabsUsers.deleteMany({});
    console.log(`   ✅ Deleted ${usersDeleteResult.deletedCount} users from devlabs`);
    
    const appsDeleteResult = await devlabsApplications.deleteMany({});
    console.log(`   ✅ Deleted ${appsDeleteResult.deletedCount} applications from devlabs\n`);

    // Drop old indexes from devlabs applications collection
    console.log('🔧 Cleaning up old indexes in devlabs...');
    try {
      const indexes = await devlabsApplications.indexes();
      console.log(`   Found ${indexes.length} indexes on applications collection`);
      
      // Drop the problematic metadata.naturalKey index if it exists
      for (const index of indexes) {
        if (index.name && (index.name === 'uniq_app_natural_key' || 
            (index.key && index.key['metadata.naturalKey']))) {
          console.log(`   🗑️  Dropping old index: ${index.name}`);
          await devlabsApplications.dropIndex(index.name);
          console.log(`   ✅ Dropped index: ${index.name}`);
        }
      }
      console.log('   ✅ Index cleanup complete\n');
    } catch (error: any) {
      console.log(`   ⚠️  Index cleanup warning: ${error.message}\n`);
    }

    // Fetch all users from test
    console.log('📥 Fetching users from test database...');
    const testUsersData = await testUsers.find({}).toArray();
    console.log(`   Found ${testUsersData.length} users\n`);

    // Fetch all applications from test
    console.log('📥 Fetching applications from test database...');
    const testApplicationsData = await testApplications.find({}).toArray();
    console.log(`   Found ${testApplicationsData.length} applications\n`);

    // Migrate users to devlabs
    console.log('👥 Migrating users to devlabs...');
    let usersInserted = 0;

    if (testUsersData.length > 0) {
      try {
        const insertResult = await devlabsUsers.insertMany(testUsersData, { ordered: false });
        usersInserted = insertResult.insertedCount;
        console.log(`   ✅ Inserted ${usersInserted} users into devlabs`);
      } catch (error: any) {
        // Handle duplicate key errors
        if (error.code === 11000) {
          usersInserted = error.result?.nInserted || 0;
          console.log(`   ✅ Inserted ${usersInserted} users (some duplicates skipped)`);
        } else {
          console.error(`   ❌ Error inserting users:`, error.message);
        }
      }
    }

    console.log(`\n   📊 Users Summary: ${usersInserted} inserted\n`);

    // Migrate applications to devlabs
    console.log('📝 Migrating applications to devlabs...');
    let applicationsInserted = 0;

    if (testApplicationsData.length > 0) {
      try {
        const insertResult = await devlabsApplications.insertMany(testApplicationsData, { ordered: false });
        applicationsInserted = insertResult.insertedCount;
        console.log(`   ✅ Inserted ${applicationsInserted} applications into devlabs`);
      } catch (error: any) {
        // Handle duplicate key errors
        if (error.code === 11000) {
          applicationsInserted = error.result?.nInserted || 0;
          console.log(`   ✅ Inserted ${applicationsInserted} applications (some duplicates skipped)`);
        } else {
          console.error(`   ❌ Error inserting applications:`, error.message);
        }
      }
    }

    console.log(`\n   📊 Applications Summary: ${applicationsInserted} inserted\n`);

    // Final summary
    console.log('═══════════════════════════════════════');
    console.log('  MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`  Source: test database`);
    console.log(`  Target: devlabs database`);
    console.log(`  `);
    console.log(`  Total users in test: ${testUsersData.length}`);
    console.log(`  Users inserted to devlabs: ${usersInserted}`);
    console.log(`  `);
    console.log(`  Total applications in test: ${testApplicationsData.length}`);
    console.log(`  Applications inserted to devlabs: ${applicationsInserted}`);
    console.log('═══════════════════════════════════════\n');

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  } finally {
    if (testConn) {
      await testConn.close();
      console.log('\n🔌 Closed test connection');
    }
    if (devlabsConn) {
      await devlabsConn.close();
      console.log('🔌 Closed devlabs connection');
    }
  }
}

// Run the migration
migrateData();

