import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function dropOldIndexes() {
  try {
    const mongoUri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Failed to get database connection');
    }
    const usersCollection = db.collection('users');

    // List all current indexes
    console.log('\nCurrent indexes on users collection:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    // Drop all old profile.emailLower indexes
    const indexesToDrop = ['profile.emailLower_1', 'uniq_emailLower_sparse'];
    
    for (const indexName of indexesToDrop) {
      try {
        console.log(`\nAttempting to drop ${indexName} index...`);
        await usersCollection.dropIndex(indexName);
        console.log(`✓ Successfully dropped ${indexName} index`);
      } catch (error: any) {
        if (error.code === 27 || error.codeName === 'IndexNotFound') {
          console.log(`Index ${indexName} not found (already removed or never existed)`);
        } else {
          console.log(`Warning: Could not drop ${indexName}:`, error.message);
        }
      }
    }

    // List indexes after cleanup
    console.log('\nIndexes after cleanup:');
    const finalIndexes = await usersCollection.indexes();
    finalIndexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\n✓ Index cleanup completed successfully!');
    
  } catch (error) {
    console.error('Error during index cleanup:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
dropOldIndexes();

