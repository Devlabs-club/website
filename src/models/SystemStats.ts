import mongoose, { Schema } from 'mongoose';

const SystemStatsSchema = new Schema(
  {
    type: { type: String, required: true, unique: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    computedAt: { type: Date, required: true },
    computeDurationMs: { type: Number },
  },
  { timestamps: false }
);

export default mongoose.models['SystemStats'] ||
  mongoose.model('SystemStats', SystemStatsSchema);
