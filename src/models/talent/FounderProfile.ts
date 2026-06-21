import mongoose from 'mongoose';

const FounderProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    founderEmail: { type: String, required: true, index: true },
    founderName: { type: String, default: null },
    company: { type: String, required: true },
    companyWebsite: { type: String, default: null },
    linkedin: { type: String, default: null },
    startupSummary: { type: String, default: null },
    industry: { type: String, default: null },
    fundingStage: { type: String, default: null },
    productDescription: { type: String, default: null },
    techStackHints: [{ type: String }],
    founderBio: { type: String, default: null },
    logoUrl: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    enrichmentStatus: {
      type: String,
      enum: ['pending', 'partial', 'complete', 'failed'],
      default: 'pending',
    },
    enrichmentSources: [{ type: String }],
    onboardingCompletedAt: { type: Date, default: null },
    enrichedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default (mongoose.models.FounderProfile as mongoose.Model<any>) ||
  mongoose.model('FounderProfile', FounderProfileSchema);
