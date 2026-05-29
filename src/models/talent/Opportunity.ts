import mongoose from 'mongoose';

const OpportunitySchema = new mongoose.Schema(
  {
    founderName: { type: String, default: null },
    founderEmail: { type: String, default: null },
    company: { type: String, required: true, index: true },
    startupSummary: { type: String, default: null },
    industry: { type: String, default: null },
    builderWillDo: { type: String, default: null },
    roleTitle: { type: String, required: true },
    roleType: [{ type: String }],
    skillsNeeded: [{ type: String }],
    budget: { type: String, default: null },
    timeline: { type: String, default: null },
    workType: { type: String, default: null },
    availabilityNeeded: { type: String, default: null },
    locationPreference: { type: String, default: null },
    successIn30Days: { type: String, default: null },
    niceToHaveSkills: [{ type: String }],
    seniority: { type: String, default: null },
    hoursPerWeek: { type: String, default: null },
    deliverables: [{ type: String }],
    fundingStage: { type: String, default: null },
    skippedFields: [{ type: String }],
    status: {
      type: String,
      enum: ['draft', 'preview', 'paid', 'matching', 'shortlisted', 'interviewing', 'hired', 'closed'],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true }
);

export default (mongoose.models.Opportunity as mongoose.Model<any>) ||
  mongoose.model('Opportunity', OpportunitySchema);
