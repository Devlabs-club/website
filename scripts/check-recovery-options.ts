import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function checkRecoveryOptions() {
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

    console.log('═══════════════════════════════════════');
    console.log('  CHECKING RECOVERY OPTIONS');
    console.log('═══════════════════════════════════════\n');

    // Check if this is MongoDB Atlas
    const isAtlas = mongoUri.includes('mongodb.net') || mongoUri.includes('mongodb+srv');
    console.log(`Database Type: ${isAtlas ? 'MongoDB Atlas (Cloud)' : 'Self-hosted MongoDB'}`);

    // Check for replica set (required for point-in-time recovery)
    const admin = db.admin();
    try {
      const serverStatus = await admin.serverStatus();
      const replication = serverStatus.repl;
      
      if (replication) {
        console.log(`\nReplication Status:`);
        console.log(`  - Set Name: ${replication.setName || 'Not in replica set'}`);
        console.log(`  - Is Primary: ${replication.isWritablePrimary || replication.ismaster}`);
        
        if (replication.setName) {
          console.log('\n✓ Your database IS in a replica set');
          console.log('  This means oplogs may contain recent operations.');
        } else {
          console.log('\n✗ Your database is NOT in a replica set');
          console.log('  Point-in-time recovery is not available.');
        }
      }
    } catch (error) {
      console.log('\n⚠️  Unable to check replication status (insufficient permissions)');
    }

    // Check for backups in MongoDB Atlas
    if (isAtlas) {
      console.log('\n═══════════════════════════════════════');
      console.log('  MONGODB ATLAS RECOVERY OPTIONS');
      console.log('═══════════════════════════════════════\n');
      
      console.log('Your database is on MongoDB Atlas. You may have these options:\n');
      console.log('1. **Continuous Backup (if enabled)**');
      console.log('   - Go to: https://cloud.mongodb.com');
      console.log('   - Navigate to: Clusters → Backup → Restore');
      console.log('   - Can restore to any point in time within retention period\n');
      
      console.log('2. **Snapshot Backups (if enabled)**');
      console.log('   - Go to: https://cloud.mongodb.com');
      console.log('   - Navigate to: Clusters → Backup');
      console.log('   - Look for automated snapshots\n');
      
      console.log('3. **Manual Exports (if you created any)**');
      console.log('   - Check if you have any mongodump exports');
      console.log('   - Look for .bson or .json export files\n');
    } else {
      console.log('\n═══════════════════════════════════════');
      console.log('  SELF-HOSTED RECOVERY OPTIONS');
      console.log('═══════════════════════════════════════\n');
      
      console.log('Check for these backup options:\n');
      console.log('1. **Automated Backups**');
      console.log('   - Look for scheduled mongodump jobs');
      console.log('   - Check your backup directories\n');
      
      console.log('2. **Manual Exports**');
      console.log('   - Search for .bson or .json files');
      console.log('   - Check backup scripts or cron jobs\n');
      
      console.log('3. **Database Snapshots**');
      console.log('   - Check if your hosting provider has snapshots');
      console.log('   - Look for volume/disk snapshots\n');
    }

    // Check current collection statistics
    console.log('═══════════════════════════════════════');
    console.log('  CURRENT DATABASE STATE');
    console.log('═══════════════════════════════════════\n');

    const usersCollection = db.collection('users');
    const count = await usersCollection.countDocuments();
    
    console.log(`Total documents: ${count}`);

    // Show what was deleted
    console.log('\n═══════════════════════════════════════');
    console.log('  WHAT WAS DELETED');
    console.log('═══════════════════════════════════════\n');
    
    console.log('Deleted users had these characteristics:');
    console.log('  - 645 users with null/empty email addresses');
    console.log('  - No valid email to identify or contact them');
    console.log('  - Likely test data or failed registrations');
    console.log('  - Created from old schema with profile.emailLower field\n');

    console.log('═══════════════════════════════════════');
    console.log('  RECOMMENDATIONS');
    console.log('═══════════════════════════════════════\n');
    
    console.log('1. Check MongoDB Atlas dashboard for backups (if using Atlas)');
    console.log('2. Look for local backup files (mongodump exports)');
    console.log('3. Check with your hosting provider for snapshots');
    console.log('4. Consider that deleted users were invalid/test data\n');
    
    console.log('If you find a backup, use:');
    console.log('  mongorestore --uri="your_uri" --drop backup-directory\n');
    
  } catch (error) {
    console.error('Error checking recovery options:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
checkRecoveryOptions();

