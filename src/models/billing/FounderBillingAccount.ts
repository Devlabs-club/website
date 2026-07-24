import mongoose from 'mongoose';

const FounderBillingAccountSchema = new mongoose.Schema(
  {
    founderId: { type: String, required: true },
    founderEmail: { type: String, required: true, lowercase: true, trim: true },
    plan: {
      type: String,
      enum: ['free', 'growth', 'custom'],
      default: 'free',
      index: true,
    },
    status: {
      type: String,
      enum: ['free', 'trialing', 'active', 'past_due', 'canceled', 'deposit_paid', 'custom_active'],
      default: 'free',
      index: true,
    },
    billingInterval: {
      type: String,
      enum: ['monthly', 'yearly', null],
      default: null,
    },
    stripeCustomerId: { type: String, default: null, index: true },
    stripeSubscriptionId: { type: String, default: null, index: true },
    stripePriceId: { type: String, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    entitlementsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    adminOverride: {
      plan: { type: String, enum: ['free', 'growth', 'custom', null], default: null },
      status: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      reason: { type: String, default: null },
      updatedBy: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

FounderBillingAccountSchema.index({ founderEmail: 1 }, { unique: true });
FounderBillingAccountSchema.index({ founderId: 1 }, { unique: true, sparse: true });

export default (mongoose.models.FounderBillingAccount as mongoose.Model<any>) ||
  mongoose.model('FounderBillingAccount', FounderBillingAccountSchema);
