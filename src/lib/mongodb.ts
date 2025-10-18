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
 * Application schema - updated to new simplified structure
 * 
 * Key changes:
 * - Removed deprecated fields (name, age, email, phone, yearOfStudy, etc.)
 * - Made user field required and unique (one application per user)
 * - Removed updatedAt timestamp (only tracking createdAt)
 * - All personal data is stored in the User collection
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
    
    // Track/cohort information
    track: { type: String, index: true },
    
    // Team information
    teamName: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    teamPreference: { type: String, enum: ['hasTeam', 'needTeam', 'solo'] },
    
    // Event logistics
    tShirtSize: { type: String },
    dietaryRestrictions: { type: String },
    
    // Application essay
    whyJoin: { type: String },
    
    // Resume URL (uploaded to Cloudinary)
    resumeUrl: { type: String },
    
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