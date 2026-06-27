import mongoose from 'mongoose';

const SlotSchema = new mongoose.Schema(
  {
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: 'UTC' },
  },
  { _id: false }
);

const CallScheduleSchema = new mongoose.Schema(
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
    matchRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchRecord',
      default: null,
    },
    introRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IntroRequest',
      default: null,
    },
    proposedSlot: { type: SlotSchema, default: null },
    confirmedSlot: { type: SlotSchema, default: null },
    status: {
      type: String,
      enum: ['proposed', 'pending_builder', 'pending_founder', 'confirmed', 'completed', 'cancelled'],
      default: 'proposed',
      index: true,
    },
    proposedBy: {
      type: String,
      enum: ['founder', 'builder'],
      default: 'founder',
    },
    meetingUrl: { type: String, default: null },
    notes: { type: String, default: null },
    rescheduleCount: { type: Number, default: 0 },
    callCompletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CallScheduleSchema.index({ opportunityId: 1, builderId: 1 }, { unique: true });

export default (mongoose.models.CallSchedule as mongoose.Model<any>) ||
  mongoose.model('CallSchedule', CallScheduleSchema);
