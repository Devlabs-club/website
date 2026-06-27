import mongoose from 'mongoose';

/**
 * One iMessage conversation thread with a builder, keyed by their handle (phone/email).
 * Stores the rolling chat history we feed back into the Builder Agent runner, plus
 * dedupe state so repeated webhook deliveries are idempotent.
 */
const ImessageMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    providerMessageGuid: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ImessageConversationSchema = new mongoose.Schema(
  {
    // Normalized handle the builder texts us from (E.164 phone or lowercased email)
    handle: { type: String, required: true, unique: true, index: true },
    // BlueBubbles chat GUID (e.g. "iMessage;-;+15551234567"), learned from inbound
    chatGuid: { type: String, default: null },
    service: { type: String, enum: ['iMessage', 'SMS'], default: 'iMessage' },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', default: null, index: true },
    // claim lifecycle for this thread
    claimState: {
      type: String,
      enum: ['unresolved', 'resolved', 'confirming', 'activated', 'opted_out'],
      default: 'unresolved',
    },
    messages: { type: [ImessageMessageSchema], default: [] },
    // last N inbound guids we've already processed (idempotency)
    processedGuids: { type: [String], default: [] },
    lastInboundAt: { type: Date, default: null },
    lastOutboundAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default (mongoose.models.ImessageConversation as mongoose.Model<any>) ||
  mongoose.model('ImessageConversation', ImessageConversationSchema);
