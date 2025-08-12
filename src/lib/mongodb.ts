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
    return makeConnection(MONGODB_URI);
}

async function connectAdminDB() {
    return makeConnection(MONGODB_ADMIN_URI);
}

// Define schema - this is safe even during static build
const applicationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    gender: { type: String, required: true },
    dob: { 
        type: Date, 
        required: true,
        // Ensure date is stored as yyyy-mm-dd (ISO 8601 date only, no time)
        set: (val: string | Date) => {
            if (typeof val === 'string') {
                // Accepts 'yyyy-mm-dd' or ISO string, strips time if present
                return new Date(val.split('T')[0]);
            }
            if (val instanceof Date) {
                // Zero out time part
                return new Date(val.getFullYear(), val.getMonth(), val.getDate());
            }
            return val;
        },
        get: (val: Date) => {
            if (!val) return val;
            // Format as yyyy-mm-dd
            return val.toISOString().split('T')[0];
        }
    },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    country: { type: String, required: true },
    projectIdea: { type: String, required: true },
    referralSource: { type: String, required: true },
    twitterHandle: { type: String },
    // New optional profile/link and background fields
    linkedin: { type: String },
    personalWebsite: { type: String },
    portfolio: { type: String },
    github: { type: String },
    primarySkills: { type: String },
    currentRole: { type: String },
    coolestThing: { type: String },
    favoriteLink: { type: String },
    hackathonStory: { type: String },
    additionalInfo: { type: String },
    proofOfWork: { type: String },
    progress: { type: Number, default: 0 },
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