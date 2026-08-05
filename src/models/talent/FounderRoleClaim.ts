import mongoose from 'mongoose';

/**
 * A tokenized "claim link" that DevLabs emails to a cold founder for a role (or
 * roles) we pre-created on their behalf. The founder clicks the link, logs in via
 * the normal Google/WorkOS flow, and the claim landing page (/founder/claim/[token])
 * binds the pre-built Opportunity + Shortlist to whichever account they authenticate
 * with — identity is trusted from the login session, authorization from this token.
 */
const FounderRoleClaimSchema = new mongoose.Schema(
  {
    // Opportunities (roles) this claim unlocks. Usually one; can be several for a
    // founder we sourced multiple roles for (e.g. Founding Eng + Product Eng).
    opportunityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true }],

    // The email we cold-reached (for reference/analytics only). Not used for auth —
    // the founder may log in with a different address, which is fine.
    targetEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    company: { type: String, default: null },

    // sha256 of the raw token; the raw token only ever lives in the emailed URL.
    tokenHash: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: ['email_sent', 'consumed', 'expired'],
      default: 'email_sent',
      index: true,
    },

    // Filled in when the founder actually claims (from their authenticated session).
    consumedByUserId: { type: String, default: null },
    consumedByEmail: { type: String, default: null, lowercase: true, trim: true },
    consumedAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

FounderRoleClaimSchema.index({ targetEmail: 1, status: 1, createdAt: -1 });

export default (mongoose.models.FounderRoleClaim as mongoose.Model<any>) ||
  mongoose.model('FounderRoleClaim', FounderRoleClaimSchema);
