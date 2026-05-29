import mongoose from 'mongoose';

const MatchRecordSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    matchScore: { type: Number, min: 0, max: 100, required: true },
    matchLabel: {
      type: String,
      enum: ['Strong Match', 'Good Match', 'Possible Match'],
      default: null,
    },
    anonymousLabel: { type: String, default: null },
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
      enum: [
        'generated',
        'approved',
        'intro_requested',
        'builder_interested',
        'interviewing',
        'trial',
        'offer',
        'hired',
        'closed',
        'rejected',
      ],
      default: 'generated',
      index: true,
    },
    pipelineNextStep: { type: String, default: null },
    trialProject: {
      title: { type: String, default: null },
      goal: { type: String, default: null },
      deliverables: [{ type: String }],
      timeline: { type: String, default: null },
      suggestedPayRange: { type: String, default: null },
      successCriteria: [{ type: String }],
      updatedAt: { type: Date, default: null },
      status: {
        type: String,
        enum: ['draft', 'sent', 'in_progress', 'submitted', 'approved', 'rejected'],
        default: 'draft',
      },
      sentAt: { type: Date, default: null },
      submittedAt: { type: Date, default: null },
      submission: {
        demoUrl: { type: String, default: null },
        githubUrl: { type: String, default: null },
        notes: { type: String, default: null },
        submittedAt: { type: Date, default: null },
      },
      rejectionNotes: [
        {
          note: { type: String },
          rejectedAt: { type: Date, default: Date.now },
        },
      ],
      rejectionCount: { type: Number, default: 0 },
    },
    callCompletedAt: { type: Date, default: null },
    hireNote: { type: String, default: null },
  },
  { timestamps: true }
);

MatchRecordSchema.index({ builderId: 1, opportunityId: 1 }, { unique: true });

export default (mongoose.models.MatchRecord as mongoose.Model<any>) ||
  mongoose.model('MatchRecord', MatchRecordSchema);
