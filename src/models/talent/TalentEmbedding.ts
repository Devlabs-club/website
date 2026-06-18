import mongoose, { Schema } from 'mongoose';

const TalentEmbeddingSchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ['builder_profile', 'project', 'opportunity'],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },
    builderId: { type: String, index: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    model: { type: String, default: 'text-embedding-3-small' },
    dimensions: { type: Number, default: 1536 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

TalentEmbeddingSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
TalentEmbeddingSchema.index({ entityType: 1, builderId: 1 });

export default mongoose.models['TalentEmbedding'] ||
  mongoose.model('TalentEmbedding', TalentEmbeddingSchema);
