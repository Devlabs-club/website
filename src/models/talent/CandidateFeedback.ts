import mongoose, { Schema } from 'mongoose';

const CandidateFeedbackSchema = new Schema(
  {
    founderId: { type: String, required: true, index: true },
    founderEmail: { type: String, required: true },
    opportunityId: { type: String, required: true, index: true },
    builderId: { type: String, required: true, index: true },
    builderName: { type: String },

    action: {
      type: String,
      enum: ['saved', 'rejected', 'intro_requested', 'trial_sent', 'hired'],
      required: true,
    },

    reasonCategory: {
      type: String,
      enum: [
        'wrong_skills',
        'weak_proof',
        'unclear_contribution',
        'weak_backend',
        'weak_frontend',
        'availability_mismatch',
        'too_junior',
        'strong_project',
        'strong_stack',
        'clear_contribution',
        'startup_experience',
        'good_availability',
        'other',
      ],
    },

    reasonText: { type: String },
    shouldAffectRanking: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CandidateFeedbackSchema.index({ founderId: 1, opportunityId: 1 });
CandidateFeedbackSchema.index({ founderId: 1, builderId: 1 });

export default mongoose.models['CandidateFeedback'] ||
  mongoose.model('CandidateFeedback', CandidateFeedbackSchema);
