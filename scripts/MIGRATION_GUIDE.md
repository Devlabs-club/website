# Test to DevLabs Database Migration Guide

This guide explains how to use the `migrate-devhacks-to-test.ts` script to migrate data from the test database to the devlabs database.

## Overview

The migration script copies users and applications from the `test` database to the `devlabs` database while:

- **Clearing all existing data from devlabs first**
- Preserving ObjectId references between users and applications
- Using bulk insert operations for efficient data transfer
- Maintaining the relationship integrity between collections

## Prerequisites

1. **Node.js** (v18.17.0 or higher)
2. **pnpm** or **npm** package manager
3. **MongoDB access** to both source and target databases

## Database Connections

- **Source Database:** `mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/test`
- **Target Database:** `mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/devlabs`

## ⚠️ IMPORTANT WARNING

**This script will DELETE ALL EXISTING DATA in the devlabs database before migrating!**

Always ensure you have a backup of your devlabs database before running this script.

## How to Run

### Quick Start

```bash
# Run the migration script
pnpm run migrate-devhacks
```

Or if using npm:

```bash
npm run migrate-devhacks
```

### What Happens During Migration

1. **Connection Phase**

   - Connects to test database
   - Connects to devlabs database

2. **Cleanup Phase**

   - **Deletes all users from devlabs database**
   - **Deletes all applications from devlabs database**
   - Shows count of deleted records

3. **Fetch Phase**

   - Fetches all users from test database
   - Fetches all applications from test database
   - Shows count of records found

4. **User Migration**

   - Bulk inserts all users into devlabs
   - Preserves ObjectIds from test database
   - Shows success count

5. **Application Migration**

   - Bulk inserts all applications into devlabs
   - Preserves ObjectIds and user references
   - Shows success count

6. **Summary Report**
   - Total users/applications in source database
   - Number of records inserted into devlabs

## Expected Output

```
🔄 Starting migration from test to devlabs database...

📡 Connecting to test database...
✅ Connected to test

📡 Connecting to devlabs database...
✅ Connected to devlabs

🗑️  Clearing devlabs database...
   ✅ Deleted 100 users from devlabs
   ✅ Deleted 80 applications from devlabs

📥 Fetching users from test database...
   Found 150 users

📥 Fetching applications from test database...
   Found 120 applications

👥 Migrating users to devlabs...
   ✅ Inserted 150 users into devlabs

   📊 Users Summary: 150 inserted

📝 Migrating applications to devlabs...
   ✅ Inserted 120 applications into devlabs

   📊 Applications Summary: 120 inserted

═══════════════════════════════════════
  MIGRATION SUMMARY
═══════════════════════════════════════
  Source: test database
  Target: devlabs database

  Total users in test: 150
  Users inserted to devlabs: 150

  Total applications in test: 120
  Applications inserted to devlabs: 120
═══════════════════════════════════════

✅ Migration completed successfully!

🔌 Closed test connection
🔌 Closed devlabs connection
```

## Data Schema Mapping

### User Schema (test → devlabs)

```typescript
{
  _id: ObjectId,              // Preserved from source
  name: String,
  email: String,
  password: String,
  role: String,
  major: String | null,
  resumeUrl: String | null,
  oauthProvider: String | null,
  oauthId: String | null,
  coolestThing: String | null,
  hackathonStory: String | null,
  additionalInfo: String | null,
  createdAt: Date,
  updatedAt: Date,
  __v: Number
}
```

### Application Schema (test → devlabs)

```typescript
{
  _id: ObjectId,              // Preserved from source
  user: ObjectId,             // References User._id
  major: String,
  yearOfStudy: String,        // e.g., "Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"
  expectedGradYear: Number,   // e.g., 2025
  linkedin: String,
  github: String,
  website: String,
  workEligibility: String,    // "Yes" or "No"
  needSponsorship: String,    // "Yes" or "No"
  sponsorshipType: String,
  resumeUrl: String,
  createdAt: Date
}
```

## Safety Features

1. **Bulk Operations**: Uses efficient bulk insert operations
2. **ObjectId Preservation**: Maintains exact ObjectIds from source database
3. **Error Handling**: Catches and reports errors during migration
4. **Complete Replacement**: Ensures devlabs has clean, consistent data from test

## ⚠️ Data Loss Warning

**This script permanently deletes all data in the devlabs database!**

- All existing users will be deleted
- All existing applications will be deleted
- This action cannot be undone without a backup
- Always backup the devlabs database before running

## Troubleshooting

### Issue: "MongoDB URI not found in environment variables"

**Solution**: The script uses hardcoded connection strings, so this shouldn't occur. If it does, check the script file.

### Issue: "Skipping application - user not found"

**Cause**: Application references a user that wasn't migrated
**Solution**: Check if the user exists in devhacks25 database and wasn't filtered out

### Issue: "User already exists" for all users

**Cause**: Migration has already been run
**Effect**: This is normal - the script will skip existing users and only insert new ones

### Issue: Connection timeout

**Cause**: Network issues or incorrect connection string
**Solution**: Verify internet connection and MongoDB cluster availability

## Verifying Migration

After running the migration, you can verify the results:

```bash
# Connect to devlabs database via MongoDB Shell
mongosh "mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/devlabs"

# Check user count
db.users.countDocuments()

# Check application count
db.applications.countDocuments()

# Verify a user-application relationship
db.applications.findOne({ user: ObjectId("68e9944960975126217b507a") })

# Check if the user exists
db.users.findOne({ _id: ObjectId("68e9944960975126217b507a") })

# Verify application schema (should be flat, not nested in metadata)
db.applications.findOne()
```

## Notes

- ⚠️ The migration preserves ObjectIds from the test database
- ⚠️ **ALL existing data in devlabs is deleted before migration**
- ⚠️ The source (test) database is not modified
- ⚠️ Applications use flat schema (fields at root level, not nested in `metadata`)
- ✅ Complete data replacement ensures consistency
- ✅ Shows detailed progress and summary

## Need Help?

If you encounter issues:

1. Check the error message in the console output
2. Verify MongoDB cluster is accessible
3. Check network connectivity
4. Ensure you have read/write permissions on both databases
5. Review the script logs for detailed error information
