import mongoose from 'mongoose';

const LegacyRefSchema = new mongoose.Schema(
  {
    collection: { type: String, required: true },
    documentId: { type: String, required: true },
    fieldPath: { type: String, default: 'root' },
  },
  { _id: false }
);

const BuilderProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    name: { type: String, required: true, trim: true, index: true },
    headline: { type: String, default: null },
    bio: { type: String, default: null },
    email: { type: String, lowercase: true, trim: true, index: true },
    phone: { type: String, default: null },
    location: { type: String, default: null },
    timezone: { type: String, default: null },
    universityOrCompany: { type: String, default: null },
    graduationYear: { type: Number, default: null },
    currentStatus: {
      type: String,
      enum: ['student', 'full_time', 'unemployed', 'founder', 'freelancer', 'other'],
      default: 'student',
    },
    rolePreference: [{ type: String }],
    workAuthorization: { type: String, default: null },
    preferredWorkType: [{ type: String }],
    links: {
      linkedin: { type: String, default: null },
      github: { type: String, default: null },
      portfolio: { type: String, default: null },
      personalWebsite: { type: String, default: null },
      resume: { type: String, default: null },
      devpost: { type: String, default: null },
    },
    availability: {
      availableNow: { type: Boolean, default: false },
      hoursPerWeek: { type: Number, default: null },
      desiredCompensation: { type: String, default: null },
      salaryExpectationMin: { type: Number, default: null },
      salaryExpectationMax: { type: Number, default: null },
      earliestStartDate: { type: Date, default: null },
      remotePreference: {
        type: String,
        enum: ['remote', 'in_person', 'hybrid', 'unspecified'],
        default: 'unspecified',
      },
      refreshedAt: { type: Date, default: null },
    },
    hiringIntent: {
      internship: { type: Boolean, default: false },
      contract: { type: Boolean, default: false },
      fullTime: { type: Boolean, default: false },
      cofounder: { type: Boolean, default: false },
      projectSprint: { type: Boolean, default: false },
      optedIn: { type: Boolean, default: false },
    },
    profileCompletion: {
      score: { type: Number, default: 0 },
      profileScore: { type: Number, default: 0 },
      proofScore: { type: Number, default: 0 },
      matchScore: { type: Number, default: 0 },
      missingItems: [{ type: String }],
      eligibility: {
        type: String,
        enum: ['not_eligible', 'eligible', 'priority'],
        default: 'not_eligible',
      },
    },
    profileQuality: {
      overallScore: { type: Number, default: 0 },
      label: { type: String, default: 'Needs Work' },
      oneLineSummary: { type: String, default: '' },
      founderClarity: {
        score: { type: Number, default: 0 },
        label: { type: String, default: '' },
        summary: { type: String, default: '' }
      },
      strengths: [{ title: String, detail: String }],
      issues: [{ field: String, severity: String, title: String, detail: String }],
      suggestedFixes: [{ field: String, priority: String, action: String, example: String }],
      fieldScores: { type: Map, of: Number },
      source: { type: String, default: 'deterministic' },
      evaluatedAt: { type: Date, default: null }
    },
    verificationStatus: {
      type: String,
      enum: ['imported_unverified', 'builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified', 'rejected'],
      default: 'imported_unverified',
      index: true,
    },
    visibilityStatus: {
      type: String,
      enum: ['public', 'matched_only', 'hidden'],
      default: 'matched_only',
    },
    legacyRefs: [LegacyRefSchema],
  },
  { timestamps: true }
);

BuilderProfileSchema.index({ email: 1, name: 1 });

export default (mongoose.models.BuilderProfile as mongoose.Model<any>) ||
  mongoose.model('BuilderProfile', BuilderProfileSchema);
