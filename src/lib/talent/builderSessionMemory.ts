/**
 * Per-session memory for the builder iMessage agent — one markdown doc per claim.
 * Stored on BuilderProfileClaim.metadata.sessionMemoryMd (no Supermemory).
 */

export function readSessionMemory(claim: any): string {
  return String(claim?.metadata?.sessionMemoryMd || '').trim();
}

export function appendSessionMemory(claim: any, entry: string) {
  const line = entry.trim();
  if (!line) return;
  claim.metadata = claim.metadata || {};
  const prev = readSessionMemory(claim);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  claim.metadata.sessionMemoryMd = prev ? `${prev}\n- [${stamp}] ${line}` : `- [${stamp}] ${line}`;
}

/** Format session memory for agent system prompt injection. */
export function formatSessionMemoryBlock(claim: any): string {
  const md = readSessionMemory(claim);
  if (!md) return '';
  return `SESSION MEMORY (this conversation — never re-ask):\n${md}`;
}

/** Append extracted facts as markdown bullets. */
export function appendSessionFacts(claim: any, facts: string[]) {
  for (const f of facts) appendSessionMemory(claim, f);
}
