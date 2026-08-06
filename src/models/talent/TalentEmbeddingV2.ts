import mongoose, { Schema } from 'mongoose';

/**
 * Per-entity metadata for the V2 embedding pipeline. Does not carry the
 * vector itself — the vector lives in TalentEmbeddingVectorSearch, keyed by
 * vectorKey, so identical text (e.g. a repeated bio line) can share one
 * stored embedding across entities.
 */
const TalentEmbeddingV2Schema = new Schema(
  {
    documentType: {
      type: String,
      enum: ['builder_profile', 'project', 'experience'],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },
    builderId: { type: Schema.Types.ObjectId, required: true, index: true },
    text: { type: String, required: true },
    contentHash: { type: String, required: true },
    vectorKey: { type: String, required: true, index: true },
    model: { type: String, required: true },
    dimensions: { type: Number, required: true },
    quality: { type: Schema.Types.Mixed },
    sources: { type: [String], default: [] },
    embeddingVersion: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, collection: 'talentembeddings_v2' }
);

export default mongoose.models['TalentEmbeddingV2'] ||
  mongoose.model('TalentEmbeddingV2', TalentEmbeddingV2Schema);
