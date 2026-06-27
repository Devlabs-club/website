import mongoose from 'mongoose';

const EventRegistrationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventRecord',
      required: true,
      index: true,
    },
    builderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuilderProfile',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    responses: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['submitted', 'withdrawn', 'waitlisted', 'accepted', 'rejected'],
      default: 'submitted',
      index: true,
    },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

EventRegistrationSchema.index({ eventId: 1, builderId: 1 }, { unique: true });

export default (mongoose.models.EventRegistration as mongoose.Model<any>) ||
  mongoose.model('EventRegistration', EventRegistrationSchema);
