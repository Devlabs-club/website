import mongoose from 'mongoose';

/**
 * Lightweight per-builder memory for the iMessage builder-care agent.
 *
 * Each document is ONE durable fact the builder told us (a preference, a
 * constraint, a detail we still need to fill in). The agent reads these back
 * at the start of every turn so it never re-asks something the builder already
 * answered, and writes new ones via the `remember_fact` tool.
 *
 * Stored in Mongo (no external memory service) — cheapest + simplest, and it
 * lives right next to the BuilderProfile it enriches.
 */
const BuilderAgentMemorySchema = new mongoose.Schema(
  {
    // Either link is enough to recall; builderId is preferred once known.
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuilderProfile', default: null, index: true },
    builderEmail: { type: String, lowercase: true, trim: true, default: null, index: true },
    phone: { type: String, default: null, index: true },

    // What kind of fact this is, so we can prioritise recall.
    kind: {
      type: String,
      enum: ['preference', 'constraint', 'fact', 'todo', 'context'],
      default: 'fact',
      index: true,
    },
    // Optional profile field this fact is about (e.g. "availability", "location").
    field: { type: String, default: null },
    // The fact itself, in the builder's own framing where possible.
    content: { type: String, required: true, trim: true },

    // Set true once the agent has acted on this (e.g. wrote it to the profile).
    resolved: { type: Boolean, default: false },
    source: { type: String, default: 'imessage' },
    lastReferencedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BuilderAgentMemorySchema.index({ builderId: 1, resolved: 1, updatedAt: -1 });
BuilderAgentMemorySchema.index({ phone: 1, updatedAt: -1 });

export default (mongoose.models.BuilderAgentMemory as mongoose.Model<any>) ||
  mongoose.model('BuilderAgentMemory', BuilderAgentMemorySchema);
