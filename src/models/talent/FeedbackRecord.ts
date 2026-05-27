import mongoose from 'mongoose';

const FeedbackRecordSchema = new mongoose.Schema(
  {
    reviewerName: { type: String, default: null },
    reviewerRole: { type: String, default: null },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectRecord', default: null },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventRecord', default: null },
    technicalAbility: { type: Number, min: 1, max: 10, default: null },
    communication: { type: Number, min: 1, max: 10, default: null },
    reliability: { type: Number, min: 1, max: 10, default: null },
    speed: { type: Number, min: 1, max: 10, default: null },
    ownership: { type: Number, min: 1, max: 10, default: null },
    creativity: { type: Number, min: 1, max: 10, default: null },
    teamwork: { type: Number, min: 1, max: 10, default: null },
    founderReadiness: { type: Number, min: 1, max: 10, default: null },
    wouldWorkAgain: { type: String, enum: ['yes', 'maybe', 'no'], default: 'maybe' },
    notes: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: ['imported_unverified', 'builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified', 'rejected'],
      default: 'imported_unverified',
    },
  },
  { timestamps: true }
);

export default (mongoose.models.FeedbackRecord as mongoose.Model<any>) ||
  mongoose.model('FeedbackRecord', FeedbackRecordSchema);
