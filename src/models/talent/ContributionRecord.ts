import mongoose from 'mongoose';

const ContributionRecordSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectRecord', required: true, index: true },
    role: { type: String, default: null },
    contributionAreas: [{ type: String }],
    specificContribution: { type: String, default: null },
    skillsUsed: [{ type: String }],
    hoursContributed: { type: Number, default: null },
    selfReportedContribution: { type: String, default: null },
    peerConfirmed: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ['imported_unverified', 'builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified', 'rejected'],
      default: 'imported_unverified',
    },
  },
  { timestamps: true }
);

ContributionRecordSchema.index({ builderId: 1, projectId: 1 }, { unique: true });

export default (mongoose.models.ContributionRecord as mongoose.Model<any>) ||
  mongoose.model('ContributionRecord', ContributionRecordSchema);
