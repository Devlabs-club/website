import mongoose from 'mongoose';

const ProjectSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectRecord', required: true },
    projectName: { type: String, default: null },
    description: { type: String, default: null },
    problemSolved: { type: String, default: null },
    techStack: [{ type: String }],
    builderContribution: { type: String, default: null },
    contributionTags: [{ type: String }],
    verificationStatus: { type: String, default: null },
    links: {
      demo: { type: String, default: null },
      github: { type: String, default: null },
      devpost: { type: String, default: null },
      pitchDeck: { type: String, default: null },
      videoDemo: { type: String, default: null },
      screenshots: { type: String, default: null },
    },
    evidenceScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const TalentSearchIndexSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, unique: true, index: true },
    name: { type: String, default: null },
    headline: { type: String, default: null },
    rolePreference: [{ type: String }],
    universityOrCompany: { type: String, default: null },
    education: [
      {
        school: { type: String, default: null },
        degree: { type: String, default: null },
        field: { type: String, default: null },
        source: { type: String, default: null },
      },
    ],
    normalizedSkills: [{ type: String }],
    normalizedProjectTech: [{ type: String }],
    normalizedContributionTags: [{ type: String }],
    searchTerms: [{ type: String }],
    preferredWorkType: [{ type: String }],
    links: {
      linkedin: { type: String, default: null },
      github: { type: String, default: null },
      portfolio: { type: String, default: null },
      personalWebsite: { type: String, default: null },
      resume: { type: String, default: null },
      devpost: { type: String, default: null },
    },
    availability: {
      availableNow: { type: Boolean, default: false },
      remotePreference: { type: String, default: 'unspecified' },
    },
    hiringIntent: {
      internship: { type: Boolean, default: false },
      contract: { type: Boolean, default: false },
      fullTime: { type: Boolean, default: false },
      cofounder: { type: Boolean, default: false },
      projectSprint: { type: Boolean, default: false },
      optedIn: { type: Boolean, default: false },
    },
    profileCompletion: {
      score: { type: Number, default: 0 },
      profileScore: { type: Number, default: 0 },
      proofScore: { type: Number, default: 0 },
      matchScore: { type: Number, default: 0 },
      eligibility: { type: String, default: null },
    },
    profileQuality: {
      overallScore: { type: Number, default: 0 },
      label: { type: String, default: null },
      oneLineSummary: { type: String, default: null },
      founderClarity: {
        score: { type: Number, default: 0 },
        label: { type: String, default: null },
        summary: { type: String, default: null },
      },
    },
    verificationStatus: { type: String, default: null, index: true },
    visibilityStatus: { type: String, default: null, index: true },
    projectCount: { type: Number, default: 0 },
    strongProjectCount: { type: Number, default: 0 },
    bestProjectEvidenceScore: { type: Number, default: 0 },
    projectSnapshots: [ProjectSnapshotSchema],
    agentWrapped: {
      uploaded: { type: Boolean, default: false },
      archetype: { type: String, default: null },
      score: { type: Number, default: null },
      agents: [{ type: String }],
      languages: [{ type: String }],
      frameworks: [{ type: String }],
      sessionCount: { type: Number, default: 0 },
    },
    sourceUpdatedAt: { type: Date, default: null },
    indexedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, autoIndex: false }
);

TalentSearchIndexSchema.index({ searchTerms: 1, verificationStatus: 1, visibilityStatus: 1 });
TalentSearchIndexSchema.index({ normalizedSkills: 1, verificationStatus: 1, visibilityStatus: 1 });
TalentSearchIndexSchema.index({ normalizedProjectTech: 1, verificationStatus: 1, visibilityStatus: 1 });
TalentSearchIndexSchema.index({ normalizedContributionTags: 1, verificationStatus: 1, visibilityStatus: 1 });
TalentSearchIndexSchema.index({ bestProjectEvidenceScore: -1, updatedAt: -1 });

export default (mongoose.models.TalentSearchIndex as mongoose.Model<any>) ||
  mongoose.model('TalentSearchIndex', TalentSearchIndexSchema);
