import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Use environment variable for MongoDB URI
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_ADMIN_URI = process.env.ADMIN_MONGO_URI;
if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
}
if (!MONGODB_ADMIN_URI) {
    throw new Error('Please define the ADMIN_MONGO_URI environment variable');
}

// Global caching mechanism
let cached = global.certificate_connection || { conn: null, promise: null };
let cachedAdmin = global.admin_connection || { conn: null, promise: null };

if (!global.certificate_connection) {
    global.certificate_connection = cached;
}
if (!global.admin_connection) {
    global.admin_connection = cachedAdmin;
}

async function makeConnection(mongo_url) {
    // Use cached connection if available
    if (cached.conn) {
        return cached.conn;
    }

    // Create new connection if none exists
    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(mongo_url, opts);
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

async function connectDB() {
    console.log(`Connecting to ${MONGODB_URI}`);
    return makeConnection(MONGODB_URI);
}

async function makeAdminConnection(mongo_url: string) {
    // Use cached admin connection if available
    if (cachedAdmin.conn) {
        return cachedAdmin.conn;
    }

    if (!cachedAdmin.promise) {
        const opts = {
            bufferCommands: false,
        };
        cachedAdmin.promise = mongoose.connect(mongo_url, opts);
    }

    try {
        cachedAdmin.conn = await cachedAdmin.promise;
    } catch (e) {
        cachedAdmin.promise = null;
        throw e;
    }

    return cachedAdmin.conn;
}

async function connectAdminDB() {
    console.log(`Connecting to admin DB ${MONGODB_ADMIN_URI}`);
    return makeAdminConnection(MONGODB_ADMIN_URI as string);
}

// Define schema - this is safe even during static build
const applicationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    age: { type: Number, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    major: { type: String, required: true },
    yearOfStudy: { type: String, enum: ["Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"], required: true },
    expectedGradYear: { type: Number, required: true },
    linkedin: { type: String, required: true },
    website: { type: String },
    workEligibility: { type: String, enum: ["Yes", "No"], required: true },
    needSponsorship: { type: String, enum: ["Yes", "No"], required: true },
    sponsorshipType: { type: String },
    track: { type: String },
    progress: { type: Number, default: 0 },
    resumeUrl: { type: String },
    // Additional profile fields
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: {
        naturalKey: { type: String }
    },
    dietaryRestrictions: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    tShirtSize: { type: String },
    teamName: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    teamPreference: { type: String, enum: ['hasTeam', 'needTeam', 'solo'] },
    whyJoin: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Initialize model safely for serverless environment
let Application;
try {
    Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);
} catch (error) {
    console.error('MongoDB model initialization error:', error);
}

export { connectDB, connectAdminDB, Application }; 