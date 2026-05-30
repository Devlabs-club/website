import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageThread',
      required: true,
      index: true,
    },
    senderType: { type: String, enum: ['founder', 'builder', 'system'], required: true },
    senderEmail: { type: String, default: null },
    body: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

MessageSchema.index({ threadId: 1, createdAt: 1 });

export default (mongoose.models.Message as mongoose.Model<any>) ||
  mongoose.model('Message', MessageSchema);
