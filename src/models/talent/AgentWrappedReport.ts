import mongoose from 'mongoose';

const AgentWrappedReportSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    reportId: { type: String, required: true, index: true },
    report: { type: mongoose.Schema.Types.Mixed, required: true },
    localAnalysisVersion: { type: String, default: null },
    methodologyVersion: { type: String, default: null },
    selectedPublicIdentityId: { type: String, default: null },
    acquisitionSource: { type: mongoose.Schema.Types.Mixed, default: null },
    source: {
      type: String,
      enum: ['uploaded_agent_usage'],
      default: 'uploaded_agent_usage',
      index: true,
    },
    consent: {
      approvedAt: { type: Date, default: null },
      rawContentUploaded: { type: Boolean, required: true, default: false },
    },
    sourceCoverage: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

AgentWrappedReportSchema.index({ builderId: 1, createdAt: -1 });
AgentWrappedReportSchema.index({ builderId: 1, reportId: 1 }, { unique: true });

export default (mongoose.models.AgentWrappedReport as mongoose.Model<any>) ||
  mongoose.model('AgentWrappedReport', AgentWrappedReportSchema);
