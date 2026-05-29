import mongoose from 'mongoose';

const AnonymousCandidateSchema = new mongoose.Schema(
  {
    matchRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'MatchRecord', default: null },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true },
    anonymousLabel: { type: String, required: true },
    matchScore: { type: Number, min: 0, max: 100, required: true },
    matchLabel: {
      type: String,
      enum: ['Strong Match', 'Good Match', 'Possible Match'],
      required: true,
    },
    roleType: { type: String, default: null },
    topSkills: [{ type: String }],
    proofSummary: { type: String, default: null },
    availabilitySummary: { type: String, default: null },
    whyTheyMatch: { type: String, default: null },
  },
  { _id: false }
);

const ShortlistSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
      unique: true,
      index: true,
    },
    founderEmail: { type: String, required: true, index: true, lowercase: true, trim: true },
    unlocked: { type: Boolean, default: false, index: true },
    unlockedAt: { type: Date, default: null },
    hiddenBuilderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile' }],
    totalMatches: { type: Number, default: 0 },
    strongMatchCount: { type: Number, default: 0 },
    candidates: [AnonymousCandidateSchema],
    previewGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default (mongoose.models.Shortlist as mongoose.Model<any>) ||
  mongoose.model('Shortlist', ShortlistSchema);
