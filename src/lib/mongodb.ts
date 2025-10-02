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