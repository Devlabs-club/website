import mongoose from 'mongoose';

const MatchRecordSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    matchScore: { type: Number, min: 0, max: 100, required: true },
    signalScores: {
      skillMatch: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      proofOfWork: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      reliability: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      startupReadiness: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      availability: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      collaboration: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    },
    reasoning: { type: String, default: null },
    evidence: [{ label: String, url: String }],
    riskFlags: [{ type: String }],
    status: {
      type: String,
      enum: ['generated', 'approved', 'intro_requested', 'interviewing', 'hired', 'rejected'],
      default: 'generated',
      index: true,
    },
  },
  { timestamps: true }
);

MatchRecordSchema.index({ builderId: 1, opportunityId: 1 }, { unique: true });

export default (mongoose.models.MatchRecord as mongoose.Model<any>) ||
  mongoose.model('MatchRecord', MatchRecordSchema);
