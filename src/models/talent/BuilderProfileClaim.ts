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
    phoneVerificationCodeHash: { type: String, default: null },
    phoneVerificationExpiresAt: { type: Date, default: null },
    phoneVerificationAttempts: { type: Number, default: 0 },
    conversationQuestionIndex: { type: Number, default: 0 },
    conversationFailures: [{ type: String }],
    messages: [ClaimMessageSchema],
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
