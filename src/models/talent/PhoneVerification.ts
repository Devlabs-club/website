import mongoose from 'mongoose';

/**
 * Short-lived OTP record for phone verification during the iMessage claim flow.
 * The code is stored hashed. Docs auto-expire via a TTL index on `expiresAt`.
 */
const PhoneVerificationSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true }, // E.164
    email: { type: String, required: true, lowercase: true }, // from the signed claim token
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', default: null },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumed: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

PhoneVerificationSchema.index({ phone: 1, email: 1 });
PhoneVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.PhoneVerification as mongoose.Model<any>) ||
  mongoose.model('PhoneVerification', PhoneVerificationSchema);
