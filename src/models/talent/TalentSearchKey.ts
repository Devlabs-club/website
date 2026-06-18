import mongoose from 'mongoose';

const TalentSearchKeySchema = new mongoose.Schema(
  {
    term: { type: String, required: true, index: true },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    kind: {
      type: String,
      enum: ['skill', 'project_tech', 'contribution', 'text'],
      required: true,
      index: true,
    },
    weight: { type: Number, default: 1 },
    evidenceScore: { type: Number, default: 0 },
    indexedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, autoIndex: false }
);

TalentSearchKeySchema.index({ term: 1, weight: -1 });
TalentSearchKeySchema.index({ builderId: 1, term: 1 }, { unique: true });

export default (mongoose.models.TalentSearchKey as mongoose.Model<any>) ||
  mongoose.model('TalentSearchKey', TalentSearchKeySchema);
