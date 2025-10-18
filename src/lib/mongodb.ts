import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_ADMIN_URI = process.env.ADMIN_MONGO_URI;
if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
}
if (!MONGODB_ADMIN_URI) {
    throw new Error('Please define the ADMIN_MONGO_URI environment variable');
}

// Global caches (typed via src/types/global.d.ts)
const appCache = (globalThis as any).__mongooseApp__ ?? ((globalThis as any).__mongooseApp__ = { conn: null, promise: null });
const adminCache = (globalThis as any).__mongooseAdmin__ ?? ((globalThis as any).__mongooseAdmin__ = { conn: null, promise: null });

/**
 * Connect default Mongoose (app DB). Cached per process and shared across callers.
 */
export async function connectDB() {
    if (appCache.conn) return appCache.conn;

    if (!appCache.promise) {
        const opts = { bufferCommands: false } as any;
        // Real connect happens only once per process
        if (process.env.DEBUG_DB === '1') console.log(`[DB] Connecting default to ${MONGODB_URI}`);
        appCache.promise = mongoose.connect(MONGODB_URI as string, opts);
    }

    try {
        appCache.conn = await appCache.promise;
    } catch (e) {
        appCache.promise = null;
        throw e;
    }
    return appCache.conn;
}

/**
 * Connect admin DB using a dedicated connection. Cached per process.
 */
export async function connectAdminDB() {
    if (adminCache.conn) return adminCache.conn;

    if (!adminCache.promise) {
        const opts = { bufferCommands: false } as any;
        // Use a separate connection to avoid mutating the default connection's db
        const conn = mongoose.createConnection(MONGODB_ADMIN_URI as string, opts);
        if (process.env.DEBUG_DB === '1') console.log(`[DB] Connecting admin to ${MONGODB_ADMIN_URI}`);
        adminCache.promise = conn.asPromise();
    }

    try {
        adminCache.conn = await adminCache.promise;
        // Ensure Application model is available on this connection
        ensureApplicationModel();
    } catch (e) {
        adminCache.promise = null;
        throw e;
    }
    return adminCache.conn;
}

/**
 * Application schema - updated to new comprehensive structure
 *
 * Notes:
 * - One application per user (unique index)
 * - Personal/contact and links are captured here at submission time
 * - Deprecated event/team fields remain but are not used; API writes them as null
 * - Only createdAt is tracked by design
 */
const applicationSchema = new mongoose.Schema({
    // User reference - required and unique (one application per user)
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        unique: true,
        index: true
    },
    
    // Application status
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending',
        index: true
    },
    
    // Academic information
    major: { type: String, required: true, index: true },

    // Personal & contact
    name: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'non-binary'], required: true },
    dob: { type: Date, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    country: { type: String, required: true },

    // Links
    linkedin: { type: String, required: true },
    github: { type: String, required: true },
    personalWebsite: { type: String, default: null },
    portfolio: { type: String, default: null },
    favoriteLink: { type: String, default: null },
    twitterHandle: { type: String, default: null },

    // Story
    coolestThing: { type: String, required: true },
    hackathonStory: { type: String, required: true },
    additionalInfo: { type: String, default: null },
    projectIdea: { type: String, default: null },
    referralSource: { type: String, default: null },
    proofOfWork: { type: String, default: null },

    // Deprecated event/team fields (explicitly nulled by API)
    track: { type: String, index: true, default: null },
    teamName: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    teamPreference: { type: String, enum: ['hasTeam', 'needTeam', 'solo'], default: null },
    tShirtSize: { type: String, default: null },
    dietaryRestrictions: { type: String, default: null },
    whyJoin: { type: String, default: null },

    // Resume URL (uploaded to Cloudinary) - required
    resumeUrl: { type: String, required: true },
    
    // Computed progress (0-4)
    progress: { type: Number, default: 0 },
    
    // Metadata for deduplication and tracking
    metadata: {
        naturalKey: { type: String, index: true }
    },
    
    // Timestamp - only createdAt, no updatedAt
    createdAt: { type: Date, default: Date.now }
}, {
    toJSON: { getters: true },
    toObject: { getters: true },
    timestamps: false // Disable automatic timestamps
});

// Initialize Application model on admin connection when available
let Application: mongoose.Model<any> | undefined;

/**
 * Ensure Application model is bound to the admin connection.
 * Call after connectAdminDB() in request handlers before using Application.
 */
function ensureApplicationModel() {
    const conn = adminCache.conn;
    if (!conn) return;
    Application = (conn.models.Application as mongoose.Model<any>) || conn.model('Application', applicationSchema);
}

// Eagerly set model if admin connection already established elsewhere
if (adminCache.conn) {
    ensureApplicationModel();
}

export { Application };