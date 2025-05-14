import mongoose from 'mongoose';

// Make sure the MONGODB_URI environment variable is defined
const MONGODB_URI = 'mongodb+srv://dhanushkalaiselvan:Y1IEElftFdcd9tnT@cluster0.vp3cm52.mongodb.net/';
if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
}

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) {
        return cached.conn;
    }

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

// Create model if it doesn't exist
const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);

export { connectDB, Application }; 