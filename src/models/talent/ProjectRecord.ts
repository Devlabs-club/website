import mongoose from 'mongoose';

const ProjectRecordSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', index: true, required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventRecord', index: true, default: null },
    projectName: { type: String, required: true, index: true },
    description: { type: String, default: null },
    problemSolved: { type: String, default: null },
    links: {
      demo: { type: String, default: null },
      github: { type: String, default: null },
      devpost: { type: String, default: null },
      pitchDeck: { type: String, default: null },
      videoDemo: { type: String, default: null },
      screenshots: { type: String, default: null },
    },
    techStack: [{ type: String }],
    teamMembersRaw: [{ type: String }],
    awardOrRanking: { type: String, default: null },
    status: {
      type: String,
      enum: ['prototype', 'launched', 'abandoned', 'active', 'incorporated', 'unknown'],
      default: 'unknown',
    },
    builderContribution: { type: String, default: null },
    contributionTags: [{ type: String }],
    traction: {
      users: { type: Number, default: null },
      revenue: { type: Number, default: null },
      waitlist: { type: Number, default: null },
      notes: { type: String, default: null },
    },
    source: { type: String, default: 'manual' },
    sourceId: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: ['imported_unverified', 'builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified', 'rejected'],
      default: 'imported_unverified',
      index: true,
    },
    confidence: { type: Number, default: 0.7 },
  },
  { timestamps: true }
);

ProjectRecordSchema.index({ builderId: 1, sourceId: 1 }, { unique: false });

export default (mongoose.models.ProjectRecord as mongoose.Model<any>) ||
  mongoose.model('ProjectRecord', ProjectRecordSchema);
