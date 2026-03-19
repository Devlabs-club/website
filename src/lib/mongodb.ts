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
// Use `any` on the global index to avoid TS complaining about custom properties.
const globalAny: any = global as any;
let cached = globalAny.certificate_connection || { conn: null, promise: null };
let cachedAdmin = globalAny.admin_connection || { conn: null, promise: null };

if (!globalAny.certificate_connection) {
    globalAny.certificate_connection = cached;
}
if (!globalAny.admin_connection) {
    globalAny.admin_connection = cachedAdmin;
}

async function makeConnection(mongo_url: string | undefined) {
    // Use cached connection if available
    if (cached.conn) {
        return cached.conn;
    }

    // Create new connection if none exists
    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(mongo_url as string, opts);
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

// Define schemas - this is safe even during static build
const applicationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    phone: { type: String, required: true },
    major: { type: String, required: true },
    yearOfStudy: { type: String, enum: ["Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"], required: true },
    expectedGradYear: { type: Number, required: true },
    linkedin: { type: String, required: true },
    github: { type: String },
    website: { type: String },
    workEligibility: { type: String, enum: ["Yes", "No"], required: true },
    needSponsorship: { type: String, enum: ["Yes", "No"], required: true },
    sponsorshipType: { type: String },
    resumeUrl: { type: String },
    createdAt: { type: Date, default: Date.now }
}, {
    toJSON: { getters: true },
    toObject: { getters: true }
});

const momentumReminderSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true },
    tag: { type: String, default: 'momentum-2026-reminder' },
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Initialize models safely for serverless environment
let Application: mongoose.Model<any>;
let MomentumReminder: mongoose.Model<any>;
try {
    Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);
    MomentumReminder = mongoose.models.MomentumReminder || mongoose.model('MomentumReminder', momentumReminderSchema, 'momentum');
} catch (error) {
    console.error('MongoDB model initialization error:', error);
}

export { connectDB, connectAdminDB, Application, MomentumReminder }; 