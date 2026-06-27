import mongoose from 'mongoose';

const FounderChatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FounderChatSession',
      required: true,
      index: true,
    },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosting', default: null, index: true },
    founderId: { type: String, required: true, index: true },
    founderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ['founder', 'assistant', 'tool'], required: true },
    content: { type: String, required: true },
    toolName: { type: String, default: null },
    toolResult: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

FounderChatMessageSchema.index({ sessionId: 1, createdAt: 1 });
FounderChatMessageSchema.index({ founderId: 1, jobId: 1, createdAt: 1 });

export default (mongoose.models.FounderChatMessage as mongoose.Model<any>) ||
  mongoose.model('FounderChatMessage', FounderChatMessageSchema, 'founder_agent_messages');
