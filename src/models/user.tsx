import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser {
  _id?: string;
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  major?: string;
  resumeUrl?: string;
  oauthProvider?: 'google' | null; // OAuth provider type
  oauthId?: string; // OAuth provider user ID
  coolestThing?: string;
  hackathonStory?: string;
  additionalInfo?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: function() {
      // Password is only required for non-OAuth users
      return !this.oauthProvider;
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  major: {
    type: String,
    default: null,
  },
  resumeUrl: {
    type: String,
    default: null,
  },
  oauthProvider: {
    type: String,
    enum: ['google', null],
    default: null,
  },
  oauthId: {
    type: String,
    default: null,
  },
  coolestThing: {
    type: String,
    default: null,
  },
  hackathonStory: {
    type: String,
    default: null,
  },
  additionalInfo: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  // Only hash if password is modified and exists (for non-OAuth users)
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  // For OAuth users without passwords, return false
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update the updatedAt field before saving
userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Initialize model safely for serverless environment
let User;
try {
  User = mongoose.models.User || mongoose.model('User', userSchema);
} catch (error) {
  console.error('User model initialization error:', error);
}

export default User;