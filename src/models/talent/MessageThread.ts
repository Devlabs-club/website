import mongoose from 'mongoose';

const ThreadSideStateSchema = new mongoose.Schema(
  {
    firstMessageId: { type: String, default: null },
    lastMessageId: { type: String, default: null },
    references: { type: [String], default: [] },
  },
  { _id: false }
);

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
    builderEmail: { type: String, default: null, lowercase: true, trim: true },
    introRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntroRequest', default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: null },
    /** Stable Gmail subject for the entire founder–builder thread. */
    emailSubject: { type: String, default: null },
    /** First outbound intro Message-ID (builder side). */
    rootMessageId: { type: String, default: null },
    /** Latest outbound Message-ID globally (audit). */
    lastMessageId: { type: String, default: null },
    /** Global RFC References chain (audit). */
    references: { type: [String], default: [] },
    /** SHA-256 hash of the reply alias token (plain token never stored). */
    replyTokenHash: { type: String, default: null },
    founderThreadState: { type: ThreadSideStateSchema, default: () => ({}) },
    builderThreadState: { type: ThreadSideStateSchema, default: () => ({}) },
  },
  { timestamps: true }
);

MessageThreadSchema.index({ opportunityId: 1, builderId: 1 }, { unique: true });

export default (mongoose.models.MessageThread as mongoose.Model<any>) ||
  mongoose.model('MessageThread', MessageThreadSchema);
