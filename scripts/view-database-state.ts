import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function viewDatabaseState() {
  try {
    const mongoUri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Failed to get database connection');
    }
    const usersCollection = db.collection('users');

    // Show indexes
    console.log('═══════════════════════════════════════');
    console.log('  INDEXES ON USERS COLLECTION');
    console.log('═══════════════════════════════════════');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index: any) => {
      const uniqueFlag = index.unique ? ' (UNIQUE)' : '';
      const sparseFlag = index.sparse ? ' (SPARSE)' : '';
      console.log(`\n  ${index.name}:`);
      console.log(`    Fields: ${JSON.stringify(index.key)}`);
      console.log(`    Options:${uniqueFlag}${sparseFlag}`);
    });

    // Show user counts
    console.log('\n═══════════════════════════════════════');
    console.log('  USER STATISTICS');
    console.log('═══════════════════════════════════════');
    const totalUsers = await usersCollection.countDocuments();
    console.log(`  Total users: ${totalUsers}`);

    const usersWithEmail = await usersCollection.countDocuments({
      email: { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`  Users with valid email: ${usersWithEmail}`);

    const usersWithoutEmail = await usersCollection.countDocuments({
      $or: [
        { email: null },
        { email: '' },
        { email: { $exists: false } }
      ]
    });
    console.log(`  Users without email: ${usersWithoutEmail}`);

    const oauthUsers = await usersCollection.countDocuments({
      oauthProvider: { $exists: true, $ne: null }
    });
    console.log(`  OAuth users: ${oauthUsers}`);

    // Show sample users
    console.log('\n═══════════════════════════════════════');
    console.log('  SAMPLE USERS (first 5)');
    console.log('═══════════════════════════════════════');
    const sampleUsers = await usersCollection.find({})
      .limit(5)
      .project({ name: 1, email: 1, role: 1, oauthProvider: 1, createdAt: 1 })
      .toArray();

    sampleUsers.forEach((user: any, index: number) => {
      console.log(`\n  User ${index + 1}:`);
      console.log(`    ID: ${user._id}`);
      console.log(`    Name: ${user.name || 'N/A'}`);
      console.log(`    Email: ${user.email || 'N/A'}`);
      console.log(`    Role: ${user.role || 'N/A'}`);
      console.log(`    OAuth: ${user.oauthProvider || 'No'}`);
      console.log(`    Created: ${user.createdAt || 'N/A'}`);
    });

    console.log('\n═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('Error viewing database state:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
viewDatabaseState();

