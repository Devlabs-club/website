import mongoose from 'mongoose';

const CompanyProfileSchema = new mongoose.Schema(
  {
    founderId: { type: String, required: true, index: true },
    founderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    website: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    mission: { type: String, default: null, trim: true },
    productSummary: { type: String, default: null, trim: true },
    industry: { type: String, default: null, trim: true },
    fundingStage: { type: String, default: null, trim: true },
    location: { type: String, default: null, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

CompanyProfileSchema.index({ founderId: 1 }, { unique: true });
CompanyProfileSchema.index({ founderEmail: 1 });

export default (mongoose.models.CompanyProfile as mongoose.Model<any>) ||
  mongoose.model('CompanyProfile', CompanyProfileSchema, 'companyprofiles');
