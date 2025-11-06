import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const DEVLABS_URI = 'mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/devlabs';

// Define schemas
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  major: { type: String, default: null },
  resumeUrl: { type: String, default: null },
  oauthProvider: { type: String, default: null },
  oauthId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { strict: false });

const applicationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String },
  age: { type: Number },
  phone: { type: String },
  major: { type: String },
  yearOfStudy: { type: String },
  expectedGradYear: { type: Number },
  linkedin: { type: String },
  github: { type: String },
  website: { type: String },
  workEligibility: { type: String },
  needSponsorship: { type: String },
  sponsorshipType: { type: String },
  resumeUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

async function fixApplicationUserLinks() {
  let connection: mongoose.Connection | null = null;

  try {
    console.log('🔄 Starting to fix application-user links in devlabs database...\n');

    // Connect to database
    console.log('📡 Connecting to devlabs database...');
    connection = await mongoose.createConnection(DEVLABS_URI).asPromise();
    console.log('✅ Connected to devlabs\n');

    // Create models
    const User = connection.model('User', userSchema);
    const Application = connection.model('Application', applicationSchema);

    // Find applications without user field
    console.log('🔍 Finding applications without user field...');
    const orphanedApps = await Application.find({
      $or: [
        { user: { $exists: false } },
        { user: null }
      ]
    });

    console.log(`Found ${orphanedApps.length} orphaned applications\n`);

    if (orphanedApps.length === 0) {
      console.log('✅ All applications are properly linked to users!');
      return;
    }

    // Try to link orphaned applications to users
    let fixed = 0;
    let notFixed = 0;

    for (const app of orphanedApps) {
      console.log(`\nProcessing application ${app._id}:`);
      
      // Try to find a user by matching fields (you can adjust this logic)
      // For example, if the application has an email field or name
      let user = null;
      
      // First, try to find a user with matching email if application has email
      if (app.email) {
        user = await User.findOne({ email: app.email });
        if (user) {
          console.log(`  → Found user by email: ${user.email}`);
        }
      }
      
      // If still not found and application has name, try to find by name
      if (!user && app.name) {
        user = await User.findOne({ name: app.name });
        if (user) {
          console.log(`  → Found user by name: ${user.name}`);
        }
      }

      if (user) {
        // Link the application to the user
        await Application.findByIdAndUpdate(app._id, {
          $set: { user: user._id }
        });
        console.log(`  ✅ Linked application ${app._id} to user ${user._id}`);
        fixed++;
      } else {
        console.log(`  ⚠️  Could not find matching user for application ${app._id}`);
        console.log(`     Application data:`, {
          name: app.name,
          email: app.email,
          major: app.major
        });
        notFixed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Total orphaned applications: ${orphanedApps.length}`);
    console.log(`   ✅ Fixed: ${fixed}`);
    console.log(`   ⚠️  Not fixed: ${notFixed}`);
    console.log('='.repeat(60));

    // Verify all applications now have user field
    const stillOrphaned = await Application.find({
      $or: [
        { user: { $exists: false } },
        { user: null }
      ]
    }).countDocuments();

    if (stillOrphaned > 0) {
      console.log(`\n⚠️  Warning: ${stillOrphaned} applications still don't have user field`);
      console.log('   These may need manual intervention.');
    } else {
      console.log('\n✅ All applications are now properly linked to users!');
    }

    // Check for duplicate applications (multiple applications for same user)
    console.log('\n🔍 Checking for duplicate applications...');
    const duplicates = await Application.aggregate([
      { $match: { user: { $exists: true, $ne: null } } },
      { $group: { _id: '$user', count: { $sum: 1 }, applications: { $push: { id: '$_id', createdAt: '$createdAt' } } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    console.log(`Found ${duplicates.length} users with multiple applications\n`);

    if (duplicates.length > 0) {
      console.log('🔧 Cleaning up duplicate applications...');
      let duplicatesRemoved = 0;

      for (const dup of duplicates) {
        console.log(`\nUser ${dup._id} has ${dup.count} applications:`);
        
        // Sort by createdAt (keep the most recent one)
        const apps = dup.applications.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA; // Descending order (most recent first)
        });

        // Keep the first one (most recent), delete the rest
        const toKeep = apps[0].id;
        const toDelete = apps.slice(1).map((app: any) => app.id);

        console.log(`  → Keeping most recent application: ${toKeep}`);
        console.log(`  → Deleting ${toDelete.length} older application(s)`);

        for (const appId of toDelete) {
          await Application.findByIdAndDelete(appId);
          duplicatesRemoved++;
          console.log(`    ✓ Deleted application ${appId}`);
        }
      }

      console.log(`\n✅ Removed ${duplicatesRemoved} duplicate applications`);
    }

    // Create unique index on user field
    console.log('\n🔧 Creating unique index on user field...');
    try {
      // First, check if a non-unique index exists and drop it
      const indexes = await Application.collection.indexes();
      const userIndexExists = indexes.some((idx: any) => 
        idx.key && idx.key.user === 1 && !idx.unique
      );
      
      if (userIndexExists) {
        console.log('  → Dropping existing non-unique user index...');
        await Application.collection.dropIndex('user_1');
      }

      // Now create the unique index
      await Application.collection.createIndex({ user: 1 }, { unique: true, sparse: true });
      console.log('✅ Unique index created successfully');
    } catch (indexError: any) {
      if (indexError.code === 11000) {
        console.error('❌ Still have duplicate user IDs after cleanup!');
        console.error('   Please check the database manually.');
      } else {
        throw indexError;
      }
    }

  } catch (error) {
    console.error('\n❌ Error fixing application-user links:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
  } finally {
    if (connection) {
      await connection.close();
      console.log('\n🔌 Database connection closed');
    }
    process.exit(0);
  }
}

// Run the fix
fixApplicationUserLinks();

