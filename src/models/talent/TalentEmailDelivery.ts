import mongoose from 'mongoose';

const TalentEmailDeliverySchema = new mongoose.Schema(
  {
    to: { type: String, required: true, lowercase: true, trim: true, index: true },
    from: { type: String, required: true, trim: true },
    subject: { type: String, required: true },
    emailType: { type: String, required: true, index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageThread', default: null, index: true },
    introRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntroRequest', default: null, index: true },
    matchRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'MatchRecord', default: null, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', default: null, index: true },
    founderEmail: { type: String, default: null, lowercase: true, trim: true },
    provider: { type: String, default: 'sendgrid' },
    providerMessageId: { type: String, default: null, index: true },
    status: { type: String, default: 'sent', index: true },
    sentAt: { type: Date, default: Date.now, index: true },
    deliveredAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    clickedAt: { type: Date, default: null },
    actionTakenAt: { type: Date, default: null },
    bouncedAt: { type: Date, default: null },
    droppedAt: { type: Date, default: null },
    eventCounts: {
      delivered: { type: Number, default: 0 },
      open: { type: Number, default: 0 },
      click: { type: Number, default: 0 },
      action: { type: Number, default: 0 },
      bounce: { type: Number, default: 0 },
      dropped: { type: Number, default: 0 },
    },
    lastEventAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

TalentEmailDeliverySchema.index({ emailType: 1, sentAt: -1 });
TalentEmailDeliverySchema.index({ to: 1, threadId: 1, sentAt: -1 });

export default (mongoose.models.TalentEmailDelivery as mongoose.Model<any>) ||
  mongoose.model('TalentEmailDelivery', TalentEmailDeliverySchema);
