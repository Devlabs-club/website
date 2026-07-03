import mongoose from 'mongoose';

const HiringLedgerSchema = new mongoose.Schema(
  {
    founderId: { type: String, required: true, index: true },
    founderEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', required: true, index: true },
    planAtHire: { type: String, enum: ['free', 'growth', 'custom'], default: 'custom' },
    hireStatus: {
      type: String,
      enum: ['pending', 'hired', 'closed_no_hire'],
      default: 'pending',
      index: true,
    },
    firstMonthSalaryCents: { type: Number, default: null },
    successFeeCents: { type: Number, default: null },
    depositAmountCents: { type: Number, default: 49900 },
    depositStatus: {
      type: String,
      enum: ['not_required', 'pending', 'paid', 'credited', 'forfeited', 'refunded'],
      default: 'pending',
      index: true,
    },
    depositPaymentIntentId: { type: String, default: null },
    depositCheckoutSessionId: { type: String, default: null },
    depositCreditCents: { type: Number, default: 0 },
    successFeeInvoiceId: { type: String, default: null },
    successFeeStatus: {
      type: String,
      enum: ['not_created', 'draft', 'open', 'paid', 'void', 'uncollectible'],
      default: 'not_created',
    },
    hiredAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

HiringLedgerSchema.index({ opportunityId: 1, builderId: 1 }, { unique: true });

export default (mongoose.models.HiringLedger as mongoose.Model<any>) ||
  mongoose.model('HiringLedger', HiringLedgerSchema);
