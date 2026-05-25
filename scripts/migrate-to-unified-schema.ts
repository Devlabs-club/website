import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Connection strings
const BASE_URI = 'mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net';

// Database names
const DEVHACKS_2025_DB = 'devhacks_2025';
const DEVHOUSE_SF_DB = 'devhouse-sf-edition';
const DEVLABS_DB = 'devlabs';

// Build full connection URIs
const DEVHACKS_2025_URI = `${BASE_URI}/${DEVHACKS_2025_DB}?retryWrites=true&w=majority&appName=Cluster0`;
const DEVHOUSE_SF_URI = `${BASE_URI}/${DEVHOUSE_SF_DB}?retryWrites=true&w=majority&appName=Cluster0`;
const DEVLABS_URI = `${BASE_URI}/${DEVLABS_DB}?retryWrites=true&w=majority&appName=Cluster0`;

// Interfaces for old schema
interface OldUserDocument {
  _id?: any;
  name?: string;
  email: string;
  password?: string;
  role?: 'user' | 'admin' | 'organizer';
  major?: string;
  resumeUrl?: string;
  oauthProvider?: string | null;
  oauthId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: any;
}

interface OldApplicationDocument {
  _id?: any;
  user: any;
  name: string;
  age?: number;
  phone?: string;
  major: string;
  yearOfStudy?: string;
  expectedGradYear?: number;
  linkedin?: string;
  github?: string;
  website?: string;
  workEligibility?: string;
  needSponsorship?: string;
  sponsorshipType?: string;
  resumeUrl?: string;
  createdAt?: Date;
  [key: string]: any;
}

// New unified schema interface
interface UnifiedUserDocument {
  _id?: any;
  fullName: string;
  age?: number;
  email: string;
  phone?: string;
  photoUrl?: string;
  major: string;
  yearOfStudy?: string;
  expectedGraduationYear?: number;
  linkedinUrl: string;
  githubOrPortfolioUrl?: string;
  resumeUrl?: string;
  eligibleToWorkInUS: boolean;
  requiresVisaSponsorship: boolean;
  visaType?: "H-1B" | "OPT" | "CPT" | "Green Card" | "Other" | "N/A";
  role: "user" | "admin" | "organizer";
  season?: string;
  qrCode?: string | null;
  checkedIn: boolean;
  teamPreference?: string;
  teamId?: any | null;
  clozytTrackEmailSent: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Keep password for existing users
  password?: string;
}

// Helper function to map visa type
function mapVisaType(sponsorshipType?: string): "H-1B" | "OPT" | "CPT" | "Green Card" | "Other" | "N/A" {
  if (!sponsorshipType) return "N/A";
  
  const lower = sponsorshipType.toLowerCase();
  if (lower.includes('h-1b') || lower.includes('h1b')) return "H-1B";
  if (lower.includes('opt')) return "OPT";
  if (lower.includes('cpt')) return "CPT";
  if (lower.includes('green') || lower.includes('permanent')) return "Green Card";
  
  return "Other";
}

// Helper function to convert Yes/No to boolean
function yesNoToBoolean(value?: string): boolean {
  if (!value) return false;
  return value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
}

// Merge old user and application into unified schema
function mergeToUnifiedSchema(
  user: OldUserDocument,
  application: OldApplicationDocument | null,
  sourceSeason?: string
): UnifiedUserDocument | null {
  // Only skip if email is missing (critical for unique identification)
  if (!user.email) {
    console.warn(`⚠️  Skipping user - missing email: ${user._id}`);
    return null;
  }

  const email = user.email.toLowerCase().trim();

  // Use defaults for missing required fields instead of skipping
  const fullName = (application?.name || user.name || "Unknown").trim();
  const major = (application?.major || user.major || "").trim();
  const linkedinUrl = (application?.linkedin || "").trim();

  // Log warnings for missing fields but don't skip
  if (!application?.name && !user.name) {
    console.warn(`⚠️  User ${email} - missing fullName, using "Unknown"`);
  }
  if (!application?.major && !user.major) {
    console.warn(`⚠️  User ${email} - missing major, using empty string`);
  }
  if (!application?.linkedin) {
    console.warn(`⚠️  User ${email} - missing linkedinUrl, using empty string`);
  }

  // Build unified user
  const unifiedUser: UnifiedUserDocument = {
    fullName: fullName || "Unknown",
    email: email,
    major: major || "",
    linkedinUrl: linkedinUrl || "",
    
    // Optional fields
    age: application?.age,
    phone: application?.phone?.trim(),
    photoUrl: undefined, // Not available in old schema
    yearOfStudy: application?.yearOfStudy,
    expectedGraduationYear: application?.expectedGradYear,
    githubOrPortfolioUrl: (application?.github || application?.website)?.trim(),
    resumeUrl: (application?.resumeUrl || user.resumeUrl)?.trim(),
    
    // Work authorization - required fields with defaults
    eligibleToWorkInUS: yesNoToBoolean(application?.workEligibility),
    requiresVisaSponsorship: yesNoToBoolean(application?.needSponsorship),
    visaType: mapVisaType(application?.sponsorshipType),
    
    // Role and platform
    role: (user.role as "user" | "admin" | "organizer") || "user",
    season: sourceSeason,
    qrCode: null,
    checkedIn: false,
    teamPreference: undefined,
    teamId: null,
    clozytTrackEmailSent: false,
    
    // Timestamps
    createdAt: user.createdAt || application?.createdAt || new Date(),
    updatedAt: new Date(),
    
    // Keep password if exists
    password: user.password,
  };

  return unifiedUser;
}

// Get all users with applications from devlabs
async function getUsersWithApplications(connection: mongoose.Connection): Promise<{ userId: any; email: string }[]> {
  const usersCollection = connection.db?.collection('users');
  const applicationsCollection = connection.db?.collection('applications');
  
  if (!usersCollection || !applicationsCollection) {
    throw new Error('Failed to get collections from devlabs database');
  }

  console.log('📋 Finding users with applications in devlabs...');
  
  // Get all applications with their user IDs
  const applications = await applicationsCollection.find({ user: { $exists: true, $ne: null } }).toArray();
  
  const userIdsWithApps = new Set<string>();
  applications.forEach((app: any) => {
    if (app.user) {
      userIdsWithApps.add(app.user.toString());
    }
  });

  console.log(`   Found ${userIdsWithApps.size} unique users with applications\n`);

  // Get user emails for these IDs
  const usersWithApps: { userId: any; email: string }[] = [];
  for (const userId of userIdsWithApps) {
    const user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) }) as OldUserDocument | null;
    if (user && user.email) {
      usersWithApps.push({
        userId: user._id,
        email: user.email.toLowerCase().trim()
      });
    }
  }

  return usersWithApps;
}

// Clean devlabs database - keep only users with applications
async function cleanDevlabsDatabase(
  connection: mongoose.Connection,
  usersToKeep: { userId: any; email: string }[]
): Promise<void> {
  const usersCollection = connection.db?.collection('users');
  const applicationsCollection = connection.db?.collection('applications');
  
  if (!usersCollection || !applicationsCollection) {
    throw new Error('Failed to get collections from devlabs database');
  }

  const userIdsToKeep = new Set(usersToKeep.map(u => u.userId.toString()));

  console.log('🧹 Cleaning devlabs database...');
  console.log(`   Keeping ${userIdsToKeep.size} users with applications`);

  // Count total users
  const totalUsers = await usersCollection.countDocuments({});
  const totalApplications = await applicationsCollection.countDocuments({});

  // Delete users without applications
  const deleteUsersResult = await usersCollection.deleteMany({
    _id: { $nin: Array.from(userIdsToKeep).map(id => new mongoose.Types.ObjectId(id)) }
  });

  // Delete applications that don't belong to kept users
  const deleteAppsResult = await applicationsCollection.deleteMany({
    user: { $nin: Array.from(userIdsToKeep).map(id => new mongoose.Types.ObjectId(id)) }
  });

  console.log(`   ✅ Deleted ${deleteUsersResult.deletedCount} users (kept ${totalUsers - deleteUsersResult.deletedCount})`);
  console.log(`   ✅ Deleted ${deleteAppsResult.deletedCount} applications (kept ${totalApplications - deleteAppsResult.deletedCount})\n`);
}

// Transform existing users in devlabs to unified schema
async function transformDevlabsUsers(connection: mongoose.Connection): Promise<Set<string>> {
  const usersCollection = connection.db?.collection('users');
  const applicationsCollection = connection.db?.collection('applications');
  
  if (!usersCollection || !applicationsCollection) {
    throw new Error('Failed to get collections from devlabs database');
  }

  console.log('🔄 Transforming existing devlabs users to unified schema...');

  const users = await usersCollection.find({}).toArray() as OldUserDocument[];
  const existingEmails = new Set<string>();
  let transformed = 0;
  let skipped = 0;

  for (const user of users) {
    const application = await applicationsCollection.findOne({ user: user._id }) as OldApplicationDocument | null;
    
    const unifiedUser = mergeToUnifiedSchema(user, application);
    
    if (!unifiedUser) {
      skipped++;
      continue;
    }

    // Preserve the original _id
    unifiedUser._id = user._id;

    // Replace the user document with new unified schema (preserving _id)
    await usersCollection.replaceOne(
      { _id: user._id },
      unifiedUser
    );

    // Delete the application since it's now merged into user
    if (application) {
      await applicationsCollection.deleteOne({ _id: application._id });
    }

    existingEmails.add(unifiedUser.email);
    transformed++;
  }

  console.log(`   ✅ Transformed ${transformed} users (skipped ${skipped})\n`);

  return existingEmails;
}

// Migrate users from source database
async function migrateFromSource(
  sourceConn: mongoose.Connection,
  targetConn: mongoose.Connection,
  sourceDbName: string,
  sourceSeason: string,
  existingEmails: Set<string>
): Promise<{ migrated: number; skipped: number }> {
  const sourceUsersCollection = sourceConn.db?.collection('users');
  const sourceAppsCollection = sourceConn.db?.collection('applications');
  const targetUsersCollection = targetConn.db?.collection('users');
  
  if (!sourceUsersCollection || !sourceAppsCollection || !targetUsersCollection) {
    throw new Error(`Failed to get collections from ${sourceDbName} database`);
  }

  console.log(`📥 Migrating users from ${sourceDbName}...`);

  const sourceUsers = await sourceUsersCollection.find({}).toArray() as OldUserDocument[];
  console.log(`   Found ${sourceUsers.length} users in ${sourceDbName}`);

  let migrated = 0;
  let replaced = 0;
  let skipped = 0;
  const skippedReasons: { [key: string]: number } = {};

  for (const user of sourceUsers) {
    // Skip if email is missing (critical for identification)
    const normalizedEmail = user.email?.toLowerCase().trim();
    if (!normalizedEmail) {
      skippedReasons['missing_email'] = (skippedReasons['missing_email'] || 0) + 1;
      skipped++;
      continue;
    }

    // Get application for this user
    const application = await sourceAppsCollection.findOne({ user: user._id }) as OldApplicationDocument | null;

    // Merge to unified schema
    const unifiedUser = mergeToUnifiedSchema(user, application, sourceSeason);

    if (!unifiedUser) {
      skippedReasons['invalid_data'] = (skippedReasons['invalid_data'] || 0) + 1;
      skipped++;
      continue;
    }

    // Check if user with this email already exists in target database
    const existingUser = await targetUsersCollection.findOne({ 
      email: normalizedEmail 
    });

    if (existingUser) {
      // Delete existing user and replace with new unified schema
      await targetUsersCollection.deleteOne({ email: normalizedEmail });
      replaced++;
    }

    // Insert into target database (new user or replacement)
    await targetUsersCollection.insertOne(unifiedUser);
    existingEmails.add(unifiedUser.email);
    migrated++;
  }

  console.log(`   ✅ Migrated ${migrated} users (${replaced} replaced, ${migrated - replaced} new)`);
  console.log(`   ⏭️  Skipped ${skipped} users`);
  if (Object.keys(skippedReasons).length > 0) {
    console.log(`   Reasons:`, skippedReasons);
  }
  console.log();

  return { migrated, skipped };
}

// Main migration function
async function migrateToUnifiedSchema() {
  let devhacksConn: mongoose.Connection | null = null;
  let devhouseConn: mongoose.Connection | null = null;
  let devlabsConn: mongoose.Connection | null = null;

  try {
    console.log('🔄 Starting migration to unified schema...\n');

    // Connect to all databases
    console.log(`📡 Connecting to ${DEVLABS_DB} database...`);
    devlabsConn = await mongoose.createConnection(DEVLABS_URI).asPromise();
    console.log(`✅ Connected to ${DEVLABS_DB}\n`);

    console.log(`📡 Connecting to ${DEVHACKS_2025_DB} database...`);
    devhacksConn = await mongoose.createConnection(DEVHACKS_2025_URI).asPromise();
    console.log(`✅ Connected to ${DEVHACKS_2025_DB}\n`);

    console.log(`📡 Connecting to ${DEVHOUSE_SF_DB} database...`);
    devhouseConn = await mongoose.createConnection(DEVHOUSE_SF_URI).asPromise();
    console.log(`✅ Connected to ${DEVHOUSE_SF_DB}\n`);

    // Step 1: Get users with applications in devlabs
    const usersToKeep = await getUsersWithApplications(devlabsConn);
    
    if (usersToKeep.length === 0) {
      console.log('⚠️  No users with applications found in devlabs. Continuing with migration...\n');
    } else {
      console.log(`✅ Found ${usersToKeep.length} users with applications to keep\n`);
    }

    // Step 2: Clean devlabs - keep only users with applications
    await cleanDevlabsDatabase(devlabsConn, usersToKeep);

    // Step 3: Transform existing devlabs users to unified schema
    const existingEmails = await transformDevlabsUsers(devlabsConn);

    // Step 4: Migrate from devhacks_2025
    const devhacksResult = await migrateFromSource(
      devhacksConn,
      devlabsConn,
      DEVHACKS_2025_DB,
      'devhacks-2025',
      existingEmails
    );

    // Step 5: Migrate from devhouse-sf-edition
    const devhouseResult = await migrateFromSource(
      devhouseConn,
      devlabsConn,
      DEVHOUSE_SF_DB,
      'devhouse-sf-edition',
      existingEmails
    );

    // Final summary
    const finalUserCount = await devlabsConn.db?.collection('users').countDocuments({});

    console.log('\n═══════════════════════════════════════');
    console.log('  MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`  Users kept in devlabs: ${usersToKeep.length}`);
    console.log(`  Users transformed: ${existingEmails.size}`);
    console.log(`  `);
    console.log(`  ${DEVHACKS_2025_DB}:`);
    console.log(`    Migrated: ${devhacksResult.migrated}`);
    console.log(`    Skipped: ${devhacksResult.skipped}`);
    console.log(`  `);
    console.log(`  ${DEVHOUSE_SF_DB}:`);
    console.log(`    Migrated: ${devhouseResult.migrated}`);
    console.log(`    Skipped: ${devhouseResult.skipped}`);
    console.log(`  `);
    console.log(`  Total users in devlabs: ${finalUserCount}`);
    console.log('═══════════════════════════════════════\n');

    console.log('✅ Migration completed successfully!');
    console.log('\n⚠️  Note: The applications collection may still exist but is empty.');
    console.log('   You can manually drop it if desired.\n');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  } finally {
    if (devhacksConn) {
      await devhacksConn.close();
      console.log(`🔌 Closed ${DEVHACKS_2025_DB} connection`);
    }
    if (devhouseConn) {
      await devhouseConn.close();
      console.log(`🔌 Closed ${DEVHOUSE_SF_DB} connection`);
    }
    if (devlabsConn) {
      await devlabsConn.close();
      console.log(`🔌 Closed ${DEVLABS_DB} connection`);
    }
  }
}

// Run the migration
migrateToUnifiedSchema();

