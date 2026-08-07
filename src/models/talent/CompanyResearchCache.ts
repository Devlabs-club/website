import mongoose from 'mongoose';

/**
 * Shared company deep-research cache.
 * Keyed by LinkedIn company slug or website domain so multiple founders
 * at the same company reuse one Exa/Brave research pass.
 */
const CompanyResearchCacheSchema = new mongoose.Schema(
  {
    cacheKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    website: { type: String, default: null, trim: true },
    linkedInUrl: { type: String, default: null, trim: true },
    description: { type: String, default: '' },
    whatTheyBuild: { type: String, default: '' },
    highlights: [{ type: String }],
    citations: [{ type: String }],
    searchProviders: [{ type: String }],
    researchedAt: { type: Date, required: true, default: Date.now },
    hitCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CompanyResearchCacheSchema.index({ researchedAt: -1 });

export default (mongoose.models.CompanyResearchCache as mongoose.Model<any>) ||
  mongoose.model('CompanyResearchCache', CompanyResearchCacheSchema);
