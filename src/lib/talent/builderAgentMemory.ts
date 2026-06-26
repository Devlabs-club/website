import BuilderAgentMemory from '@/models/talent/BuilderAgentMemory';
import { generateOpenRouterReply } from '@/lib/openrouter';

export type MemoryRef = {
  builderId?: string | null;
  builderEmail?: string | null;
  phone?: string | null;
};

function refQuery(ref: MemoryRef) {
  const or: Record<string, unknown>[] = [];
  if (ref.builderId) or.push({ builderId: ref.builderId });
  if (ref.builderEmail) or.push({ builderEmail: ref.builderEmail.toLowerCase() });
  if (ref.phone) or.push({ phone: ref.phone });
  return or.length ? { $or: or } : { _id: null };
}

/** Pull the facts we already know about this builder, newest first. */
export async function recallBuilderMemory(ref: MemoryRef, limit = 40) {
  if (!ref.builderId && !ref.builderEmail && !ref.phone) return [];
  const items = await BuilderAgentMemory.find(refQuery(ref))
    .sort({ resolved: 1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return items.map((m: any) => ({
    id: String(m._id),
    kind: m.kind,
    field: m.field || null,
    content: m.content,
    resolved: !!m.resolved,
  }));
}

/** Format remembered facts for injection into the agent system prompt. */
export async function recallBuilderMemoryText(ref: MemoryRef, limit = 40) {
  const items = await recallBuilderMemory(ref, limit);
  if (!items.length) return '';
  return items
    .map((m) => `- (${m.kind}${m.field ? `:${m.field}` : ''}${m.resolved ? ', done' : ''}) ${m.content}`)
    .join('\n');
}

/** Store a new fact the builder mentioned. De-dupes on near-identical content. */
export async function rememberBuilderFact(
  ref: MemoryRef,
  fact: { content: string; kind?: string; field?: string | null; resolved?: boolean }
) {
  const content = fact.content?.trim();
  if (!content) return null;
  if (!ref.builderId && !ref.builderEmail && !ref.phone) return null;

  const existing = await BuilderAgentMemory.findOne({
    ...refQuery(ref),
    content: { $regex: `^${content.slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' },
  });
  if (existing) {
    existing.content = content;
    if (fact.kind) existing.kind = fact.kind;
    if (fact.field !== undefined) existing.field = fact.field;
    if (typeof fact.resolved === 'boolean') existing.resolved = fact.resolved;
    existing.lastReferencedAt = new Date();
    await existing.save();
    return existing;
  }

  return BuilderAgentMemory.create({
    builderId: ref.builderId || null,
    builderEmail: ref.builderEmail ? ref.builderEmail.toLowerCase() : null,
    phone: ref.phone || null,
    kind: fact.kind || 'fact',
    field: fact.field ?? null,
    content,
    resolved: fact.resolved ?? false,
  });
}

/** Mark every memory matching a field as resolved (e.g. after we write it to the profile). */
export async function resolveBuilderMemoryField(ref: MemoryRef, field: string) {
  if (!field) return;
  await BuilderAgentMemory.updateMany(
    { ...refQuery(ref), field },
    { $set: { resolved: true, lastReferencedAt: new Date() } }
  );
}

/** Backfill builderId onto memories captured before we resolved the profile. */
export async function linkBuilderMemory(ref: MemoryRef, builderId: string) {
  if (!builderId) return;
  await BuilderAgentMemory.updateMany(
    { ...refQuery(ref), builderId: null },
    { $set: { builderId } }
  );
}

/**
 * Auto-capture durable facts from what the builder just said, so memory grows
 * every turn even if the agent forgets to call remember_fact. This is the
 * "never re-ask" guarantee — runs after the reply is generated. Cheap + bounded.
 */
export async function extractAndStoreFacts(
  ref: MemoryRef,
  builderMessage: string,
  existingMemoryText: string
): Promise<number> {
  const text = builderMessage?.trim();
  if (!text || text.length < 4) return 0;
  if (!ref.builderId && !ref.builderEmail && !ref.phone) return 0;

  let raw = '';
  try {
    raw = await generateOpenRouterReply({
      systemPrompt: `You capture durable facts about a builder from their chat message, for a memory store so we never re-ask them.
Return STRICT JSON: { "facts": [ { "content": string, "kind": "preference"|"constraint"|"fact"|"todo"|"context", "field": string|null } ] }.
Rules:
- Only durable, reusable facts (preferences, constraints, availability, location, work auth, what they've built, what they want). NOT pleasantries, NOT one-off logistics.
- "field" = the builder-profile field it maps to when obvious (location, availability, workAuthorization, rolePreference, headline, bio, links, experiences, projects), else null.
- Skip anything already covered by EXISTING MEMORY.
- 0-4 facts. Empty array if nothing durable.`,
      userPrompt: `EXISTING MEMORY:\n${existingMemoryText || '(none)'}\n\nBUILDER MESSAGE:\n${text}`,
      temperature: 0,
      maxTokens: 350,
      responseFormat: 'json_object',
    });
  } catch {
    return 0;
  }

  let facts: Array<{ content?: string; kind?: string; field?: string | null }> = [];
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    facts = Array.isArray(parsed?.facts) ? parsed.facts : [];
  } catch {
    return 0;
  }

  let stored = 0;
  for (const f of facts.slice(0, 4)) {
    if (!f?.content?.trim()) continue;
    await rememberBuilderFact(ref, {
      content: f.content,
      kind: f.kind || 'fact',
      field: f.field ?? null,
    });
    stored += 1;
  }
  return stored;
}
