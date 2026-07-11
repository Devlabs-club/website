import mongoose from 'mongoose';

const JobPostingSchema = new mongoose.Schema(
  {
    founderId: { type: String, default: null, index: true },
    founderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    founderName: { type: String, default: null },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyProfile', default: null },

    title: { type: String, default: null, trim: true },
    roleTitle: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    company: { type: String, required: true, index: true },
    startupSummary: { type: String, default: null },
    industry: { type: String, default: null },
    fundingStage: { type: String, default: null },

    skillsNeeded: [{ type: String }],
    originalSkillsNeeded: [{ type: String }],
    matchingSkills: [{ type: String }],
    requirements: [{ type: String }],
    searchRequirements: [
      {
        text: { type: String, required: true, trim: true },
        importance: { type: String, enum: ['must', 'nice'], default: 'must' },
      },
    ],
    responsibilities: [{ type: String }],
    builderWillDo: { type: String, default: null },
    deliverables: [{ type: String }],
    niceToHaveSkills: [{ type: String }],

    salary: { type: String, default: null },
    budget: { type: String, default: null },
    equity: { type: String, default: 'No' },
    equityConfirmed: { type: Boolean, default: false },
    visa: { type: String, default: 'Yes' },
    visaConfirmed: { type: Boolean, default: false },
    jobType: { type: String, default: null },
    workMode: { type: String, default: null },
    workType: { type: String, default: null },
    roleType: [{ type: String }],
    location: { type: String, default: null },
    locationPreference: { type: String, default: null },
    timeline: { type: String, default: null },
    seniority: { type: String, default: null },

    skippedFields: [{ type: String }],
    /** Compiled expansion of searchRequirements (match tokens + retrieval terms). Invalidated via sourceHash. */
    searchPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    poolFitMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
    billingPeriodKey: { type: String, default: null, index: true },
    planAtCreation: {
      type: String,
      enum: ['free', 'growth', 'custom', null],
      default: null,
      index: true,
    },
    entitlementSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    profileLimitApplied: { type: Number, default: null },
    managedByDevLabs: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'preview', 'paid', 'matching', 'shortlisted', 'interviewing', 'hired', 'closed'],
      default: 'draft',
      index: true,
    },
    lastSearchAt: { type: Date, default: null },
  },
  { timestamps: true, strict: false }
);

JobPostingSchema.index({ founderEmail: 1, updatedAt: -1 });
JobPostingSchema.index({ founderId: 1, updatedAt: -1 });

export default (mongoose.models.JobPosting as mongoose.Model<any>) ||
  mongoose.model('JobPosting', JobPostingSchema, 'opportunities');
