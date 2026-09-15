import mongoose from 'mongoose';
import { MANAGED_ROLE_DRAFT_STATUSES } from '@/lib/talent/managedRoleConstants';

const ManagedRoleOutreachDraftSchema = new mongoose.Schema(
  {
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    founderRoleClaimId: { type: mongoose.Schema.Types.ObjectId, ref: 'FounderRoleClaim', default: null, index: true },
    selectedBuilderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', default: null, index: true },
    targetEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    targetName: { type: String, default: null },
    channel: { type: String, enum: ['email', 'linkedin'], default: 'email', index: true },
    subject: { type: String, default: null },
    body: { type: String, required: true },
    publicPreviewUrl: { type: String, default: null },
    status: { type: String, enum: MANAGED_ROLE_DRAFT_STATUSES, default: 'draft', index: true },
    createdByUserId: { type: String, default: null },
    approvedByUserId: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    sentManuallyByUserId: { type: String, default: null },
    sentManuallyAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ManagedRoleOutreachDraftSchema.index({ opportunityId: 1, createdAt: -1 });

export default (mongoose.models.ManagedRoleOutreachDraft as mongoose.Model<any>) ||
  mongoose.model('ManagedRoleOutreachDraft', ManagedRoleOutreachDraftSchema);
