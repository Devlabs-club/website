import mongoose from 'mongoose';

const FounderChatSessionSchema = new mongoose.Schema(
  {
    founderId: { type: String, required: true, index: true },
    founderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosting', default: null, index: true },
    title: { type: String, default: 'New hire', trim: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

FounderChatSessionSchema.index(
  { founderId: 1, jobId: 1 },
  { unique: true, partialFilterExpression: { jobId: { $type: 'objectId' } } }
);
FounderChatSessionSchema.index({ founderId: 1, status: 1, lastMessageAt: -1 });

export default (mongoose.models.FounderChatSession as mongoose.Model<any>) ||
  mongoose.model('FounderChatSession', FounderChatSessionSchema, 'founder_agent_sessions');
