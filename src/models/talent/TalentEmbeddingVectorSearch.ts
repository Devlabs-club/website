import mongoose, { Schema } from 'mongoose';

/**
 * Content-addressable vector store backing the "talent-v2-vector-index"
 * Atlas Vector Search index (embedding: 1536 dims, cosine). Keyed by
 * vectorKey/contentHash so it dedupes across TalentEmbeddingV2 entities that
 * share identical source text. No builderId here by design — join back to
 * TalentEmbeddingV2 on vectorKey to resolve which builder/entity matched.
 */
const TalentEmbeddingVectorSearchSchema = new Schema(
  {
    vectorKey: { type: String, required: true, unique: true, index: true },
    contentHash: { type: String, required: true },
    model: { type: String, required: true },
    dimensions: { type: Number, required: true },
    embedding: { type: [Number], required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, collection: 'talentembeddingvectors_search' }
);

export default mongoose.models['TalentEmbeddingVectorSearch'] ||
  mongoose.model('TalentEmbeddingVectorSearch', TalentEmbeddingVectorSearchSchema);
