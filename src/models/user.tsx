import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUserProfile {
  name: string;
  gender?: string | null;
  dob?: string | null;
  email: string;
  emailLower: string;
  phone?: string | null;
  country?: string | null;
  twitterHandle?: string | null;
  linkedin?: string | null;
  personalWebsite?: string | null;
  portfolio?: string | null;
  github?: string | null;
  proofOfWork?: string | null;
  additionalInfo?: string | null;
  favoriteLink?: string | null;
  coolestThing?: string | null;
  projectIdea?: string | null;
  referralSource?: string | null;
}

export interface IUser {
  _id?: string;
  profile: IUserProfile;
  password?: string | null;
  role: 'user' | 'admin';
  resumeUrl?: string;
  oauthProvider: 'google' | null;
  oauthId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new mongoose.Schema({
  profile: {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    gender: {
      type: String,
      default: null,
    },
    dob: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
    },
    emailLower: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
    phone: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null,
    },
    twitterHandle: {
      type: String,
      default: null,
    },
    linkedin: {
      type: String,
      default: null,
    },
    personalWebsite: {
      type: String,
      default: null,
    },
    portfolio: {
      type: String,
      default: null,
    },
    github: {
      type: String,
      default: null,
    },
    proofOfWork: {
      type: String,
      default: null,
    },
    additionalInfo: {
      type: String,
      default: null,
    },
    favoriteLink: {
      type: String,
      default: null,
    },
    coolestThing: {
      type: String,
      default: null,
    },
    projectIdea: {
      type: String,
      default: null,
    },
    referralSource: {
      type: String,
      default: null,
    },
  },
  password: {
    type: String,
    required: function(this: any): boolean {
      // Password is only required for non-OAuth users
      return !this.oauthProvider;
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false, // Don't include password in queries by default
    default: null,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
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

// Hash password before findOneAndUpdate/findByIdAndUpdate
userSchema.pre('findOneAndUpdate', async function (next) {
  const update: any = this.getUpdate();

  // Check if password is being updated
  if (update.$set && update.$set.password && update.$set.password !== null) {
    try {
      const salt = await bcrypt.genSalt(12);
      update.$set.password = await bcrypt.hash(update.$set.password, salt);
    } catch (error: any) {
      return next(error);
    }
  }

  next();
});

// Ensure profile.emailLower stays in sync with profile.email on save
userSchema.pre('save', function (next) {
  if (this.profile && this.isModified('profile.email')) {
    this.profile.emailLower = this.profile.email.toLowerCase();
  }
  next();
});

// Ensure profile.emailLower stays in sync with profile.email on updates
userSchema.pre('findOneAndUpdate', function (next) {
  const update: any = this.getUpdate();

  if (update.$set && update.$set['profile.email']) {
    update.$set['profile.emailLower'] = update.$set['profile.email'].toLowerCase();
  }

  next();
});

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