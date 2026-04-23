import mongoose from 'mongoose';

export type MomentumApplicationStatus = 'pending' | 'approved' | 'rejected';
export type MomentumGroup = 'Velocity' | 'Inertia' | 'Flux' | 'Gravity';

export interface IMomentumApplication {
  userId: string;
  status: MomentumApplicationStatus;
  group?: MomentumGroup | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  startupName: string;
  startupAge: string;
  founderType: string;
  startupDomain: string;
  hasCoFounder: boolean;
  numCoFounders: number;
  coFounderDetails: string;
  description: string;
  accomplishments: string;
  adjectives: string;
  websiteOrGithub: string;
  demoVideo: string;
  linkedin: string;
  twitter: string;
  pitchDeck: string;
  keyMetrics: string;
  hasRevenue: boolean;
  isIncorporated: boolean;
  hasRaisedMoney: boolean;
  lookingToFundraise: boolean;
  heardAboutUs: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const momentumApplicationSchema = new mongoose.Schema<IMomentumApplication>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    group: {
      type: String,
      enum: ['Velocity', 'Inertia', 'Flux', 'Gravity', null],
      default: null,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    startupName: { type: String, required: true, trim: true },
    startupAge: { type: String, required: true, trim: true },
    founderType: { type: String, required: true, trim: true },
    startupDomain: { type: String, required: true, trim: true },
    hasCoFounder: { type: Boolean, required: true },
    numCoFounders: { type: Number, default: 0, min: 0 },
    coFounderDetails: { type: String, default: '', trim: true },
    description: { type: String, required: true, trim: true },
    accomplishments: { type: String, required: true, trim: true },
    adjectives: { type: String, required: true, trim: true },
    websiteOrGithub: { type: String, default: '', trim: true },
    demoVideo: { type: String, required: true, trim: true },
    linkedin: { type: String, default: '', trim: true },
    twitter: { type: String, default: '', trim: true },
    pitchDeck: { type: String, default: '', trim: true },
    keyMetrics: { type: String, default: '', trim: true },
    hasRevenue: { type: Boolean, required: true },
    isIncorporated: { type: Boolean, required: true },
    hasRaisedMoney: { type: Boolean, required: true },
    lookingToFundraise: { type: Boolean, required: true },
    heardAboutUs: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export function getMomentumApplicationModel(conn: mongoose.Connection) {
  if (conn.models.MomentumApplication) {
    return conn.models.MomentumApplication as mongoose.Model<IMomentumApplication>;
  }
  return conn.model<IMomentumApplication>(
    'MomentumApplication',
    momentumApplicationSchema,
    'applications'
  );
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
