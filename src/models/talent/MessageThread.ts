import mongoose from 'mongoose';

const MessageThreadSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
      index: true,
    },
    builderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuilderProfile',
      required: true,
      index: true,
    },
    founderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    founderName: { type: String, default: null },
    introRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntroRequest', default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: null },
  },
  { timestamps: true }
);

MessageThreadSchema.index({ opportunityId: 1, builderId: 1 }, { unique: true });

export default (mongoose.models.MessageThread as mongoose.Model<any>) ||
  mongoose.model('MessageThread', MessageThreadSchema);
