import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function ensureEmailIndex() {
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

    // List current indexes
    console.log('\nCurrent indexes on users collection:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    // Create proper email index (unique, lowercase)
    console.log('\nCreating email index...');
    try {
      await usersCollection.createIndex(
        { email: 1 }, 
        { 
          unique: true, 
          name: 'email_1'
        }
      );
      console.log('✓ Email index created successfully');
    } catch (error: any) {
      if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
        console.log('Email index already exists with same configuration');
      } else if (error.code === 11000) {
        console.log('Warning: Duplicate email values found in database. Please clean up duplicates first.');
      } else {
        console.log('Email index info:', error.message);
      }
    }

    // List final indexes
    console.log('\nFinal indexes on users collection:');
    const finalIndexes = await usersCollection.indexes();
    finalIndexes.forEach((index: any) => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\n✓ Index setup completed!');
    
  } catch (error) {
    console.error('Error during index setup:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
ensureEmailIndex();

