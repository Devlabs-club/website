import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageThread',
      required: true,
      index: true,
    },
    senderType: { type: String, enum: ['founder', 'builder', 'system'], required: true },
    senderEmail: { type: String, default: null },
    recipientRole: { type: String, enum: ['founder', 'builder'], default: null },
    direction: { type: String, enum: ['inbound', 'outbound'], default: null },
    /** RFC Message-ID (angle-bracket form). */
    messageId: { type: String, default: null, index: true, sparse: true },
    inReplyTo: { type: String, default: null },
    references: { type: [String], default: [] },
    sendgridMessageId: { type: String, default: null },
    subject: { type: String, default: null },
    body: { type: String, required: true },
    text: { type: String, default: null },
    html: { type: String, default: null },
    source: {
      type: String,
      enum: [
        'dashboard_intro',
        'dashboard_intro_confirmation',
        'gmail_reply',
        'dashboard_trial',
        'trial_submission_email',
        'system',
      ],
      default: null,
    },
    readAt: { type: Date, default: null },
    founderUnreadEmailSentAt: { type: Date, default: null },
    founderUnreadEmailLastError: { type: String, default: null },
  },
  { timestamps: true }
);

MessageSchema.index({ threadId: 1, createdAt: 1 });
MessageSchema.index({ senderType: 1, readAt: 1, founderUnreadEmailSentAt: 1, createdAt: 1 });

export default (mongoose.models.Message as mongoose.Model<any>) ||
  mongoose.model('Message', MessageSchema);
