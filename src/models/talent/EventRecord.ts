import mongoose from 'mongoose';

const EventRecordSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    slug: { type: String, index: true },
    date: { type: Date, required: true, index: true },
    type: {
      type: String,
      enum: ['hackathon', 'workshop', 'hacker_house', 'demo_day', 'founder_sprint', 'momentum', 'other'],
      required: true,
    },
    location: { type: String, default: null },
    description: { type: String, default: null },
    source: { type: String, default: 'manual' },
    verificationStatus: {
      type: String,
      enum: ['imported_unverified', 'admin_verified', 'rejected'],
      default: 'imported_unverified',
    },
  },
  { timestamps: true }
);

EventRecordSchema.index({ name: 1, date: 1 }, { unique: true });

export default (mongoose.models.EventRecord as mongoose.Model<any>) ||
  mongoose.model('EventRecord', EventRecordSchema);
