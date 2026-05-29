import mongoose from 'mongoose';

const IntroRequestSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
      index: true,
    },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    matchRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'MatchRecord', default: null },
    founderEmail: { type: String, required: true, index: true, lowercase: true, trim: true },
    founderName: { type: String, default: null },
    introMessage: { type: String, required: true },
    status: {
      type: String,
      enum: ['requested', 'builder_accepted', 'builder_declined', 'cancelled', 'completed'],
      default: 'requested',
      index: true,
    },
    viewedAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    builderResponseNote: { type: String, default: null },
    builderDeclineReason: { type: String, default: null },
  },
  { timestamps: true }
);

IntroRequestSchema.index({ opportunityId: 1, builderId: 1 }, { unique: true });

export default (mongoose.models.IntroRequest as mongoose.Model<any>) ||
  mongoose.model('IntroRequest', IntroRequestSchema);
