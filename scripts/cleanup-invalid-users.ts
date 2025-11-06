import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function cleanupInvalidUsers() {
  try {
    const mongoUri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Count total users before cleanup
    const totalBefore = await usersCollection.countDocuments();
    console.log(`\nTotal users before cleanup: ${totalBefore}`);

    // Find users with null or invalid emails
    console.log('\nSearching for users with null or invalid emails...');
    const invalidUsers = await usersCollection.find({
      $or: [
        { email: null },
        { email: '' },
        { email: { $exists: false } }
      ]
    }).toArray();

    if (invalidUsers.length === 0) {
      console.log('✓ No invalid users found!');
    } else {
      console.log(`\nFound ${invalidUsers.length} user(s) with null/invalid emails:`);
      
      invalidUsers.forEach((user: any) => {
        console.log(`  - ID: ${user._id}, Email: ${user.email || 'null'}, Name: ${user.name || 'unknown'}`);
      });

      console.log(`\nDeleting ${invalidUsers.length} invalid user(s)...`);
      const result = await usersCollection.deleteMany({
        $or: [
          { email: null },
          { email: '' },
          { email: { $exists: false } }
        ]
      });
      console.log(`✓ Deleted ${result.deletedCount} invalid user(s)`);
    }

    // Count total users after cleanup
    const totalAfter = await usersCollection.countDocuments();
    console.log(`\nTotal users after cleanup: ${totalAfter}`);

    // Verify indexes
    console.log('\nCurrent indexes:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key), index.unique ? '(unique)' : '');
    });

    console.log('\n✓ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
cleanupInvalidUsers();

