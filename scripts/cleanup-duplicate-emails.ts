import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function cleanupDuplicateEmails() {
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

    // Find duplicate emails
    console.log('\nSearching for duplicate emails...');
    const duplicates = await usersCollection.aggregate([
      {
        $group: {
          _id: '$email',
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();

    if (duplicates.length === 0) {
      console.log('✓ No duplicate emails found!');
    } else {
      console.log(`\nFound ${duplicates.length} duplicate email(s):`);
      
      for (const duplicate of duplicates) {
        console.log(`\n  Email: ${duplicate._id}`);
        console.log(`  Count: ${duplicate.count}`);
        
        // Get full details of duplicate users
        const users = await usersCollection.find({ 
          _id: { $in: duplicate.ids } 
        }).toArray();
        
        // Sort by creation date (keep the oldest/first created)
        users.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        });

        console.log(`\n  Keeping user: ${users[0]._id} (created: ${users[0].createdAt || 'unknown'})`);
        
        // Delete duplicates (keep the first one)
        const idsToDelete = users.slice(1).map(u => u._id);
        if (idsToDelete.length > 0) {
          console.log(`  Deleting ${idsToDelete.length} duplicate(s)...`);
          const result = await usersCollection.deleteMany({ 
            _id: { $in: idsToDelete } 
          });
          console.log(`  ✓ Deleted ${result.deletedCount} duplicate user(s)`);
        }
      }
    }

    // Now try to create the unique email index
    console.log('\n\nCreating unique email index...');
    try {
      await usersCollection.createIndex(
        { email: 1 }, 
        { 
          unique: true, 
          name: 'email_1'
        }
      );
      console.log('✓ Unique email index created successfully!');
    } catch (error: any) {
      if (error.code === 85) {
        console.log('✓ Email index already exists');
      } else {
        console.log('Error creating index:', error.message);
      }
    }

    // Verify final state
    console.log('\nFinal indexes:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
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
cleanupDuplicateEmails();

