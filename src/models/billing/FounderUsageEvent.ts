import mongoose from 'mongoose';

const FounderUsageEventSchema = new mongoose.Schema(
  {
    founderId: { type: String, required: true, index: true },
    founderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    eventType: {
      type: String,
      enum: ['role_created', 'search_run', 'profile_revealed', 'intro_requested', 'hire_marked'],
      required: true,
      index: true,
    },
    periodKey: { type: String, required: true, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null, index: true },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', default: null, index: true },
    planAtEvent: { type: String, enum: ['free', 'growth', 'custom'], required: true },
    quantity: { type: Number, default: 1, min: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

FounderUsageEventSchema.index({ founderEmail: 1, eventType: 1, periodKey: 1 });
FounderUsageEventSchema.index(
  { founderEmail: 1, eventType: 1, periodKey: 1, opportunityId: 1 },
  { name: 'usage_role_once_per_opportunity' }
);

export default (mongoose.models.FounderUsageEvent as mongoose.Model<any>) ||
  mongoose.model('FounderUsageEvent', FounderUsageEventSchema);
