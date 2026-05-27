import mongoose from 'mongoose';

const MomentumUpdateSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    programName: { type: String, default: 'Momentum' },
    week: { type: Number, required: true },
    weeklyGoals: { type: String, default: null },
    weeklyUpdate: { type: String, default: null },
    tasksCompleted: [{ type: String }],
    blockers: { type: String, default: null },
    demoLinks: [{ type: String }],
    hoursWorked: { type: Number, default: null },
    mentorNotes: { type: String, default: null },
    consistencyScore: { type: Number, min: 0, max: 100, default: null },
    completionScore: { type: Number, min: 0, max: 100, default: null },
    shippingVelocity: { type: Number, min: 0, max: 100, default: null },
    communicationQuality: { type: Number, min: 0, max: 100, default: null },
    verificationStatus: {
      type: String,
      enum: ['imported_unverified', 'builder_confirmed', 'admin_verified', 'rejected'],
      default: 'imported_unverified',
    },
  },
  { timestamps: true }
);

MomentumUpdateSchema.index({ builderId: 1, programName: 1, week: 1 }, { unique: true });

export default (mongoose.models.MomentumUpdate as mongoose.Model<any>) ||
  mongoose.model('MomentumUpdate', MomentumUpdateSchema);
