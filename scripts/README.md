# Database Maintenance Scripts

This directory contains utility scripts for maintaining the MongoDB database.

## Scripts Overview

### 1. `drop-old-indexes.ts`

**Command:** `pnpm run fix-indexes`

**Purpose:** Removes outdated MongoDB indexes from previous schema versions.

**When to use:**

- After schema changes that remove or rename fields
- When encountering duplicate key errors on fields that no longer exist

**What it does:**

- Lists all current indexes on the users collection
- Drops old `profile.emailLower` related indexes
- Shows final index state

---

### 2. `ensure-email-index.ts`

**Command:** `pnpm run setup-indexes`

**Purpose:** Creates the proper unique index on the email field.

**When to use:**

- After cleaning up duplicates
- When setting up a new database
- To verify proper indexes exist

**What it does:**

- Lists current indexes
- Creates a unique index on the `email` field
- Handles cases where index already exists or duplicates prevent creation

---

### 3. `cleanup-duplicate-emails.ts`

**Command:** `pnpm run cleanup-duplicates`

**Purpose:** Finds and removes duplicate email entries from the users collection.

**When to use:**

- Before creating a unique email index
- When you suspect duplicate user accounts exist

**What it does:**

- Searches for duplicate email addresses
- Keeps the oldest user (by creation date)
- Deletes all newer duplicates
- Attempts to create unique email index after cleanup

**⚠️ Warning:** This permanently deletes duplicate user records. Always backup your database first!

---

### 4. `cleanup-invalid-users.ts`

**Command:** `pnpm run cleanup-invalid-users`

**Purpose:** Removes users with null or missing email addresses.

**When to use:**

- After migrations or data imports
- When cleaning up test data
- When email field becomes required in schema

**What it does:**

- Finds users with `null`, empty string, or missing email
- Deletes these invalid users
- Shows count before and after cleanup
- Verifies index state

**⚠️ Warning:** This permanently deletes user records. Always backup your database first!

---

## Recent Fix: OAuth Duplicate Key Error

### Problem

OAuth login was failing with error:

```
E11000 duplicate key error collection: devlabs.users index: profile.emailLower_1
dup key: { profile.emailLower: null }
```

### Root Cause

The database had outdated unique indexes from a previous schema version that used a nested `profile.emailLower` field. The current schema uses a flat `email` field, but the old indexes were still active.

### Solution Applied

1. **Dropped old indexes** (`pnpm run fix-indexes`)

   - Removed `profile.emailLower_1` index
   - Removed `uniq_emailLower_sparse` index

2. **Cleaned up duplicates** (`pnpm run cleanup-duplicates`)

   - Found 645 users with `null` emails
   - Kept oldest user, deleted 644 duplicates

3. **Removed invalid users** (`pnpm run cleanup-invalid-users`)

   - Deleted 1 remaining user with null email

4. **Created proper index**
   - Added unique index on `email` field
   - Prevents future duplicate email registrations

### Result

✅ OAuth login now works without errors
✅ Database has proper unique constraint on emails
✅ All invalid/duplicate users removed

---

## Environment Requirements

All scripts require:

- MongoDB connection string in `.env` file
- Either `MONGODB_URI` or `MONGODB_ADMIN_URI` environment variable

---

## Safety Notes

⚠️ **Always backup your production database before running cleanup scripts!**

To backup MongoDB:

```bash
mongodump --uri="your_mongodb_uri" --out=backup-$(date +%Y%m%d)
```

To restore from backup:

```bash
mongorestore --uri="your_mongodb_uri" backup-20241106
```

---

## Future Maintenance

If you add new indexes or change the schema:

1. Test changes in development first
2. Create migration scripts for production
3. Document any new indexes in this README
4. Consider adding to the maintenance scripts

---

## Additional Utilities

### 5. `view-database-state.ts`

**Command:** `pnpm run view-db-state`

**Purpose:** View current database state without making any changes.

**What it shows:**

- All indexes on the users collection
- User statistics (total, with email, OAuth users)
- Sample user data (first 5 users)

**When to use:**

- Before running any cleanup scripts
- To verify database state after changes
- To troubleshoot issues

---

### 6. `restore-old-indexes.ts`

**Command:** `pnpm run restore-old-indexes`

**Purpose:** Restore the old `profile.emailLower` indexes.

**⚠️ WARNING:** This will bring back the OAuth login error! Only use this if:

- You need to rollback to a previous schema version
- You're testing or debugging
- You understand the consequences

**What it does:**

- Creates `profile.emailLower_1` index
- Creates `uniq_emailLower_sparse` index
- These indexes are incompatible with the current schema

---

## Restoring Deleted Data

**Important:** The cleanup scripts permanently deleted users with null/duplicate emails. To restore deleted data, you need a database backup.

### If you have a backup:

```bash
# Restore from backup (this will overwrite current data)
mongorestore --uri="your_mongodb_uri" --drop backup-directory

# Or restore just the users collection
mongorestore --uri="your_mongodb_uri" --collection=users backup-directory/devlabs/users.bson
```

### If you don't have a backup:

Unfortunately, deleted data cannot be recovered without a backup. The scripts deleted:

- 644 duplicate users with null emails
- 1 user with invalid/null email

**Going forward:** Always backup before running cleanup scripts!

---

### 7. `migrate-devhacks-to-test.ts`

**Command:** `pnpm run migrate-devhacks`

**Purpose:** Migrates users and applications from the test database to the devlabs database, clearing the devlabs database first.

**When to use:**

- When you need to migrate data from test to devlabs database
- When you want to replace all data in devlabs with data from test
- When setting up or refreshing the devlabs database

**What it does:**

- Connects to both test and devlabs databases
- **Deletes all existing users and applications from devlabs**
- Fetches all users and applications from test database
- Inserts them into devlabs database with their original ObjectIds
- Maintains user-application relationships
- Provides detailed progress and summary

**Connection details:**

- Source: `mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/test`
- Target: `mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net/devlabs`

**⚠️ WARNING:** This script deletes all data in the devlabs database before migrating! Always backup before running.

---

### 8. `fix-application-user-links.ts`

**Command:** `pnpm run fix-app-user-links`

**Purpose:** Fixes applications that are not properly linked to users in the users collection.

**When to use:**

- After data migrations or imports
- When applications exist without a user reference
- When you suspect orphaned applications in the database
- After schema changes that added the user reference field

**What it does:**

- Finds all applications without a user field (orphaned applications)
- Attempts to link them to users by matching email or name
- Updates the application's user field with the correct ObjectId
- Creates a unique index on the user field to prevent future orphans
- Provides detailed report of fixed and unfixed applications

**How it links applications to users:**

1. First tries to match by email (if application has email field)
2. If no match, tries to match by name
3. If a match is found, updates the application with the user's ObjectId
4. If no match is found, reports the application as unfixed

**Output:**

- Lists all orphaned applications found
- Shows which applications were successfully linked
- Reports which applications couldn't be linked (need manual intervention)
- Summary of total, fixed, and unfixed applications

**⚠️ Note:** Applications that cannot be automatically linked will need manual review. The script provides details about these applications to help you identify the correct user.

**Schema updates:**

- The application schema now has `user` field as: `{ type: ObjectId, ref: 'User', required: true, index: true, unique: true }`
- Each user can only have one application (enforced by unique index)

---

## Quick Reference

```bash
# View current database state (safe, no changes)
pnpm run view-db-state

# Fix index issues (recommended for OAuth fix)
pnpm run fix-indexes

# Setup proper indexes
pnpm run setup-indexes

# Clean duplicate emails
pnpm run cleanup-duplicates

# Remove invalid users
pnpm run cleanup-invalid-users

# Restore old indexes (⚠️ will break OAuth)
pnpm run restore-old-indexes

# Migrate from test to devlabs database
pnpm run migrate-devhacks

# Fix application-user links (links orphaned applications to users)
pnpm run fix-app-user-links
```
