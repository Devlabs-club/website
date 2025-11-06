import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function restoreOldIndexes() {
  try {
    const mongoUri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }

    console.log('⚠️  WARNING: This will restore old indexes that were causing OAuth errors!');
    console.log('⚠️  This is NOT recommended unless you have a specific reason.\n');

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Failed to get database connection');
    }
    const usersCollection = db.collection('users');

    // List current indexes
    console.log('\nCurrent indexes on users collection:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    // Recreate old indexes
    console.log('\nRecreating old indexes...');
    
    try {
      await usersCollection.createIndex(
        { 'profile.emailLower': 1 }, 
        { 
          unique: true,
          sparse: true,
          name: 'uniq_emailLower_sparse'
        }
      );
      console.log('✓ Created uniq_emailLower_sparse index');
    } catch (error: any) {
      console.log(`Could not create uniq_emailLower_sparse: ${error.message}`);
    }

    try {
      await usersCollection.createIndex(
        { 'profile.emailLower': 1 }, 
        { 
          unique: true,
          name: 'profile.emailLower_1'
        }
      );
      console.log('✓ Created profile.emailLower_1 index');
    } catch (error: any) {
      console.log(`Could not create profile.emailLower_1: ${error.message}`);
    }

    // List final indexes
    console.log('\nFinal indexes on users collection:');
    const finalIndexes = await usersCollection.indexes();
    finalIndexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\n⚠️  Note: OAuth login will likely fail again with these indexes!');
    console.log('To fix OAuth again, run: pnpm run fix-indexes\n');
    
  } catch (error) {
    console.error('Error during restore:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
restoreOldIndexes();

