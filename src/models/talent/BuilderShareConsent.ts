import mongoose from 'mongoose';
import {
  BUILDER_SHARE_CONSENT_SCOPES,
  BUILDER_SHARE_CONSENT_STATUSES,
} from '@/lib/talent/managedRoleConstants';

const BuilderShareConsentSchema = new mongoose.Schema(
  {
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    matchRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'MatchRecord', default: null, index: true },
    company: { type: String, required: true, trim: true },
    roleTitle: { type: String, required: true, trim: true },
    scope: { type: String, enum: BUILDER_SHARE_CONSENT_SCOPES, default: 'profile', index: true },
    status: { type: String, enum: BUILDER_SHARE_CONSENT_STATUSES, default: 'pending', index: true },
    requestedByUserId: { type: String, default: null },
    requestedAt: { type: Date, default: Date.now },
    respondedByUserId: { type: String, default: null },
    respondedAt: { type: Date, default: null },
    note: { type: String, default: null },
  },
  { timestamps: true }
);

BuilderShareConsentSchema.index({ builderId: 1, opportunityId: 1, scope: 1 }, { unique: true });

export default (mongoose.models.BuilderShareConsent as mongoose.Model<any>) ||
  mongoose.model('BuilderShareConsent', BuilderShareConsentSchema);
