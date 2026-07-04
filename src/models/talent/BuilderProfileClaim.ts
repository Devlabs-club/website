import mongoose from 'mongoose';

const ClaimMessageSchema = new mongoose.Schema(
  {
    direction: {
      type: String,
      enum: ['outbound', 'inbound'],
      required: true,
    },
    body: { type: String, required: true },
    channel: { type: String, default: 'imessage' },
    providerMessageId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const BuilderProfileClaimSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', default: null, index: true },
    builderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['email_sent', 'phone_pending', 'phone_verified', 'conversation_started', 'completed', 'expired'],
      default: 'email_sent',
      index: true,
    },
    phone: { type: String, default: null, index: true },
    phoneVerifiedAt: { type: Date, default: null },
    // Secret token for the builder's private profile-view link (sent only over their verified iMessage).
    viewToken: { type: String, default: null, index: true },
    phoneVerificationCodeHash: { type: String, default: null },
    phoneVerificationProvider: { type: String, default: null },
    phoneVerificationSid: { type: String, default: null },
    phoneVerificationStatus: { type: String, default: null },
    phoneVerificationExpiresAt: { type: Date, default: null },
    phoneVerificationAttempts: { type: Number, default: 0 },
    conversationQuestionIndex: { type: Number, default: 0 },
    conversationFailures: [{ type: String }],
    messages: [ClaimMessageSchema],
    // Last thing we proactively pinged the builder about (intro/trial/founder message) —
    // the default target when their next reply doesn't name a company/role explicitly.
    activeContext: {
      kind: { type: String, enum: ['intro', 'trial', 'thread', null], default: null },
      opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
      introRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntroRequest', default: null },
      threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageThread', default: null },
      setAt: { type: Date, default: null },
    },
    expiresAt: { type: Date, required: true, index: true },
    completedAt: { type: Date, default: null },
    lastMessageAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

BuilderProfileClaimSchema.index({ builderEmail: 1, status: 1, createdAt: -1 });
BuilderProfileClaimSchema.index({ phone: 1, status: 1, updatedAt: -1 });

export default (mongoose.models.BuilderProfileClaim as mongoose.Model<any>) ||
  mongoose.model('BuilderProfileClaim', BuilderProfileClaimSchema);
