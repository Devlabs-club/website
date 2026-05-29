import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'intro_received',
  'intro_viewed',
  'intro_accepted',
  'intro_declined',
  'call_scheduled',
  'call_rescheduled',
  'call_confirmed',
  'trial_sent',
  'trial_submitted',
  'trial_rejected',
  'trial_approved',
  'hired',
] as const;

const NotificationSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: ['founder', 'builder'],
      required: true,
      index: true,
    },
    recipientEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    builderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuilderProfile',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: '/dashboard' },
    entityType: {
      type: String,
      enum: ['IntroRequest', 'CallSchedule', 'MatchRecord', 'Opportunity'],
      default: null,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipientEmail: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ builderId: 1, readAt: 1, createdAt: -1 });

export default (mongoose.models.Notification as mongoose.Model<any>) ||
  mongoose.model('Notification', NotificationSchema);
