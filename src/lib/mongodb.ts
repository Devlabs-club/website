import mongoose from 'mongoose';

// Make sure the MONGODB_URI environment variable is defined
const MONGODB_URI = 'mongodb+srv://dhanushkalaiselvan:Y1IEElftFdcd9tnT@cluster0.vp3cm52.mongodb.net/';
if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
}

// Detect if we're in a server context where we can connect to MongoDB
// This helps avoid connection attempts during static build
const isServer = typeof process !== 'undefined';
const isBrowser = typeof window !== 'undefined';
// const isStaticBuild = isServer && !isBrowser && process.env.NODE_ENV === 'production';
const isStaticBuild = false;

// Global caching mechanism that works in Node.js environments
const globalObj: any = isServer && typeof global !== 'undefined' ? global : {};
let cached = globalObj.mongoose || { conn: null, promise: null };

if (isServer && !globalObj.mongoose) {
    globalObj.mongoose = cached;
}

async function connectDB() {
    // Skip DB connection during static builds
    if (isStaticBuild) {
        console.log('Static build detected, skipping DB connection');
        return null;
    }

    // Use cached connection if available
    if (cached.conn) {
        return cached.conn;
    }

    // Create new connection if none exists
    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

// Define schema - this is safe even during static build
const applicationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    gender: { type: String, required: true },
    age: { type: Number, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    about: { type: String, required: true },
    country: { type: String, required: true },
    projectIdea: { type: String, required: true },
    referralSource: { type: String, required: true },
    twitterHandle: { type: String },
    additionalInfo: { type: String },
    proofOfWork: { type: String },
    progress: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Declare model variable - will be defined at runtime only
let Application: any = null;

// Try to initialize model, but only in runtime environments
if (!isStaticBuild) {
    try {
        // Use optional chaining to safely check if model exists
        Application = mongoose.models?.Application ||
            (mongoose.connection.readyState !== 0
                ? mongoose.model('Application', applicationSchema)
                : null);
    } catch (error) {
        console.error('MongoDB model initialization error:', error);
        // Continue without the model - the API endpoints will handle this
    }
}

export { connectDB, Application }; 