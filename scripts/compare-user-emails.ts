import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Connection strings
// Note: MongoDB connection strings only specify the database name, not collection names
// Collections are accessed programmatically
const BASE_URI = 'mongodb+srv://sohamdaga22:7nxFWRlzzyuJprym@cluster0.nbjmj.mongodb.net';

// Database names (collections will be 'users' in each)
const DEVHACKS_2025_DB = 'devhacks_2025';
const DEVHOUSE_SF_DB = 'devhouse-sf-edition';
const DEVLABS_DB = 'devlabs';

// Build full connection URIs
const DEVHACKS_2025_URI = `${BASE_URI}/${DEVHACKS_2025_DB}?retryWrites=true&w=majority&appName=Cluster0`;
const DEVHOUSE_SF_URI = `${BASE_URI}/${DEVHOUSE_SF_DB}?retryWrites=true&w=majority&appName=Cluster0`;
const DEVLABS_URI = `${BASE_URI}/${DEVLABS_DB}?retryWrites=true&w=majority&appName=Cluster0`;

interface UserDocument {
    _id?: any;
    email: string;
    name?: string;
    [key: string]: any;
}

interface ApplicationDocument {
    _id?: any;
    user: any;
    name: string;
    age: number;
    phone: string;
    major: string;
    yearOfStudy: string;
    expectedGradYear: number;
    linkedin: string;
    github?: string;
    website?: string;
    workEligibility: string;
    needSponsorship: string;
    sponsorshipType?: string;
    resumeUrl?: string;
    createdAt?: Date;
    [key: string]: any;
}

interface UserWithApplication {
    email: string;
    userId: any;
    userName?: string;
    application?: ApplicationDocument;
}

async function getEmailsFromDatabase(connection: mongoose.Connection, dbName: string): Promise<Set<string>> {
    const usersCollection = connection.db?.collection('users');

    if (!usersCollection) {
        throw new Error(`Failed to get users collection from ${dbName} database`);
    }

    console.log(`📥 Fetching emails from ${dbName}...`);
    const users = await usersCollection.find({ email: { $exists: true, $ne: null } }).toArray();

    const emails = new Set<string>();
    let emailCount = 0;
    let nullEmailCount = 0;

    for (const user of users as UserDocument[]) {
        if (user.email && typeof user.email === 'string' && user.email.trim() !== '') {
            const normalizedEmail = user.email.toLowerCase().trim();
            emails.add(normalizedEmail);
            emailCount++;
        } else {
            nullEmailCount++;
        }
    }

    console.log(`   ✅ Found ${emailCount} valid emails (${nullEmailCount} users without emails)\n`);
    return emails;
}

async function getUsersWithApplications(
    connection: mongoose.Connection,
    emails: string[]
): Promise<UserWithApplication[]> {
    const usersCollection = connection.db?.collection('users');
    const applicationsCollection = connection.db?.collection('applications');

    if (!usersCollection || !applicationsCollection) {
        throw new Error('Failed to get collections from database');
    }

    console.log(`📋 Checking for applications for ${emails.length} new emails...`);

    const usersWithApplications: UserWithApplication[] = [];
    let usersFound = 0;
    let usersNotFound = 0;
    let applicationsFound = 0;

    for (const email of emails) {
        // Find user by email (case-insensitive)
        const user = await usersCollection.findOne({
            email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }) as UserDocument | null;

        if (!user) {
            usersNotFound++;
            continue;
        }

        usersFound++;
        const userId = user._id;

        // Find application for this user
        const application = await applicationsCollection.findOne({
            user: userId
        }) as ApplicationDocument | null;

        const userInfo: UserWithApplication = {
            email: email,
            userId: userId,
            userName: user.name || 'N/A',
            application: application || undefined
        };

        if (application) {
            applicationsFound++;
        }

        usersWithApplications.push(userInfo);
    }

    console.log(`   ✅ Found ${usersFound} users (${usersNotFound} not found)`);
    console.log(`   ✅ Found ${applicationsFound} applications\n`);

    return usersWithApplications;
}

function printApplicationDetails(userInfo: UserWithApplication, index: number) {
    console.log(`\n${index + 1}. Email: ${userInfo.email}`);
    console.log(`   User ID: ${userInfo.userId}`);
    console.log(`   User Name: ${userInfo.userName}`);

    if (userInfo.application) {
        const app = userInfo.application;
        console.log(`   ┌─ Application Details ────────────────────────────────────`);
        console.log(`   │ Name: ${app.name}`);
        console.log(`   │ Age: ${app.age}`);
        console.log(`   │ Phone: ${app.phone}`);
        console.log(`   │ Major: ${app.major}`);
        console.log(`   │ Year of Study: ${app.yearOfStudy}`);
        console.log(`   │ Expected Graduation Year: ${app.expectedGradYear}`);
        console.log(`   │ LinkedIn: ${app.linkedin}`);
        if (app.github) console.log(`   │ GitHub: ${app.github}`);
        if (app.website) console.log(`   │ Website: ${app.website}`);
        console.log(`   │ Work Eligibility: ${app.workEligibility}`);
        console.log(`   │ Need Sponsorship: ${app.needSponsorship}`);
        if (app.sponsorshipType) console.log(`   │ Sponsorship Type: ${app.sponsorshipType}`);
        if (app.resumeUrl) console.log(`   │ Resume URL: ${app.resumeUrl}`);
        if (app.createdAt) console.log(`   │ Created At: ${app.createdAt}`);
        console.log(`   └───────────────────────────────────────────────────────────`);
    } else {
        console.log(`   ⚠️  No application found for this user`);
    }
}

async function compareEmails() {
    let devhacksConn: mongoose.Connection | null = null;
    let devhouseConn: mongoose.Connection | null = null;
    let devlabsConn: mongoose.Connection | null = null;

    try {
        console.log('🔄 Starting email comparison...\n');

        // Connect to devhacks_2025 database
        console.log(`📡 Connecting to ${DEVHACKS_2025_DB} database...`);
        devhacksConn = await mongoose.createConnection(DEVHACKS_2025_URI).asPromise();
        console.log(`✅ Connected to ${DEVHACKS_2025_DB}\n`);

        // Connect to devhouse-sf-edition database
        console.log(`📡 Connecting to ${DEVHOUSE_SF_DB} database...`);
        devhouseConn = await mongoose.createConnection(DEVHOUSE_SF_URI).asPromise();
        console.log(`✅ Connected to ${DEVHOUSE_SF_DB}\n`);

        // Connect to devlabs database
        console.log(`📡 Connecting to ${DEVLABS_DB} database...`);
        devlabsConn = await mongoose.createConnection(DEVLABS_URI).asPromise();
        console.log(`✅ Connected to ${DEVLABS_DB}\n`);

        // Get emails from devhacks_2025
        const devhacksEmails = await getEmailsFromDatabase(devhacksConn, DEVHACKS_2025_DB);

        // Get emails from devhouse-sf-edition
        const devhouseEmails = await getEmailsFromDatabase(devhouseConn, DEVHOUSE_SF_DB);

        // Combine emails from both sources
        console.log('🔗 Combining emails from devhacks_2025 and devhouse-sf-edition...');
        const combinedEmails = new Set<string>();
        devhacksEmails.forEach(email => combinedEmails.add(email));
        devhouseEmails.forEach(email => combinedEmails.add(email));
        console.log(`   ✅ Combined set contains ${combinedEmails.size} unique emails\n`);

        // Get emails from devlabs
        const devlabsEmails = await getEmailsFromDatabase(devlabsConn, DEVLABS_DB);

        // Find new emails in devlabs that don't exist in the combined set
        console.log('🔍 Finding new emails in devlabs that don\'t exist in combined set...');
        const newEmails: string[] = [];
        devlabsEmails.forEach(email => {
            if (!combinedEmails.has(email)) {
                newEmails.push(email);
            }
        });

        // Print results
        console.log('\n═══════════════════════════════════════');
        console.log('  EMAIL COMPARISON SUMMARY');
        console.log('═══════════════════════════════════════');
        console.log(`  ${DEVHACKS_2025_DB}: ${devhacksEmails.size} unique emails`);
        console.log(`  ${DEVHOUSE_SF_DB}: ${devhouseEmails.size} unique emails`);
        console.log(`  Combined: ${combinedEmails.size} unique emails`);
        console.log(`  ${DEVLABS_DB}: ${devlabsEmails.size} unique emails`);
        console.log(`  `);
        console.log(`  New emails in ${DEVLABS_DB}: ${newEmails.length}`);
        console.log('═══════════════════════════════════════\n');

        if (newEmails.length > 0) {
            console.log('📧 New emails found in devlabs:');
            console.log('─────────────────────────────────────');
            newEmails.forEach((email, index) => {
                console.log(`  ${index + 1}. ${email}`);
            });
            console.log('─────────────────────────────────────\n');

            // Get users and their applications for new emails
            const usersWithApplications = await getUsersWithApplications(devlabsConn, newEmails);

            // Print detailed information
            console.log('\n═══════════════════════════════════════');
            console.log('  DETAILED USER & APPLICATION INFO');
            console.log('═══════════════════════════════════════\n');

            const usersWithApps = usersWithApplications.filter(u => u.application);
            const usersWithoutApps = usersWithApplications.filter(u => !u.application);

            console.log(`📊 Summary:`);
            console.log(`   Total new emails: ${newEmails.length}`);
            console.log(`   Users found: ${usersWithApplications.length}`);
            console.log(`   Users with applications: ${usersWithApps.length}`);
            console.log(`   Users without applications: ${usersWithoutApps.length}\n`);

            if (usersWithApplications.length > 0) {
                // Print all users with their applications
                usersWithApplications.forEach((userInfo, index) => {
                    printApplicationDetails(userInfo, index + 1);
                });

                // Summary at the end
                console.log('\n═══════════════════════════════════════');
                console.log('  SUMMARY');
                console.log('═══════════════════════════════════════');
                console.log(`  Total new emails: ${newEmails.length}`);
                console.log(`  Users found: ${usersWithApplications.length}`);
                console.log(`  Users with applications: ${usersWithApps.length}`);
                console.log(`  Users without applications: ${usersWithoutApps.length}`);
                console.log('═══════════════════════════════════════\n');
            }
        } else {
            console.log('✅ No new emails found. All emails in devlabs already exist in the combined set.\n');
        }

        console.log('✅ Comparison completed successfully!');

    } catch (error) {
        console.error('❌ Error during email comparison:', error);
        process.exit(1);
    } finally {
        if (devhacksConn) {
            await devhacksConn.close();
            console.log(`\n🔌 Closed ${DEVHACKS_2025_DB} connection`);
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

// Run the comparison
compareEmails();

