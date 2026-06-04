import Supermemory from 'supermemory';
import { containers } from './memory/containerTags';

function getClient(): Supermemory | null {
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) return null;
  return new Supermemory({ apiKey: key, maxRetries: 1, timeout: 5000 });
}

export type MemoryProfile = {
  static: string[];
  dynamic: string[];
};

// ─── Profile (static + dynamic summary) ────────────────────────────────────

export async function getBuilderMemoryProfile(
  builderId: string,
  query?: string
): Promise<MemoryProfile | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const res = await client.profile({
      containerTag: containers.builder(builderId),
      ...(query ? { q: query } : {}),
    });
    return { static: res.profile?.static ?? [], dynamic: res.profile?.dynamic ?? [] };
  } catch (err) {
    console.warn('[supermemory] getBuilderMemoryProfile failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getFounderMemoryProfile(
  founderId: string,
  query?: string
): Promise<MemoryProfile | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const res = await client.profile({
      containerTag: containers.founder(founderId),
      ...(query ? { q: query } : {}),
    });
    return { static: res.profile?.static ?? [], dynamic: res.profile?.dynamic ?? [] };
  } catch (err) {
    console.warn('[supermemory] getFounderMemoryProfile failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getOpportunityMemoryProfile(
  opportunityId: string,
  query?: string
): Promise<MemoryProfile | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const res = await client.profile({
      containerTag: containers.opportunity(opportunityId),
      ...(query ? { q: query } : {}),
    });
    return { static: res.profile?.static ?? [], dynamic: res.profile?.dynamic ?? [] };
  } catch (err) {
    console.warn('[supermemory] getOpportunityMemoryProfile failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function searchBuilderMemories(builderId: string, query: string): Promise<string[]> {
  const client = getClient();
  if (!client || !query.trim()) return [];
  try {
    const res = await client.search.memories({ q: query, containerTag: containers.builder(builderId) });
    return (res.results ?? []).map((r: any) => String(r.memory ?? r.chunk ?? '')).filter(Boolean);
  } catch (err) {
    console.warn('[supermemory] searchBuilderMemories failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function searchFounderMemories(founderId: string, query: string): Promise<string[]> {
  const client = getClient();
  if (!client || !query.trim()) return [];
  try {
    const res = await client.search.memories({ q: query, containerTag: containers.founder(founderId) });
    return (res.results ?? []).map((r: any) => String(r.memory ?? r.chunk ?? '')).filter(Boolean);
  } catch (err) {
    console.warn('[supermemory] searchFounderMemories failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function searchOpportunityMemories(opportunityId: string, query: string): Promise<string[]> {
  const client = getClient();
  if (!client || !query.trim()) return [];
  try {
    const res = await client.search.memories({ q: query, containerTag: containers.opportunity(opportunityId) });
    return (res.results ?? []).map((r: any) => String(r.memory ?? r.chunk ?? '')).filter(Boolean);
  } catch (err) {
    console.warn('[supermemory] searchOpportunityMemories failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function searchCandidateFitMemories(
  opportunityId: string,
  builderId: string,
  query: string
): Promise<string[]> {
  const client = getClient();
  if (!client || !query.trim()) return [];
  try {
    const res = await client.search.memories({ q: query, containerTag: containers.candidateFit(opportunityId, builderId) });
    return (res.results ?? []).map((r: any) => String(r.memory ?? r.chunk ?? '')).filter(Boolean);
  } catch (err) {
    console.warn('[supermemory] searchCandidateFitMemories failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Write (scoped, fire-and-forget safe) ───────────────────────────────────

export async function addMemoryToContainer(containerTag: string, content: string): Promise<void> {
  const client = getClient();
  if (!client || !content.trim()) return;
  try {
    await client.add({
      content,
      containerTag,
      entityContext: 'DevLabs OS — hiring intelligence platform.',
    });
  } catch (err) {
    console.warn('[supermemory] addMemoryToContainer failed:', err instanceof Error ? err.message : err);
  }
}

export async function addBuilderMemory(builderId: string, content: string): Promise<void> {
  return addMemoryToContainer(containers.builder(builderId), content);
}

export async function addFounderMemory(founderId: string, content: string): Promise<void> {
  return addMemoryToContainer(containers.founder(founderId), content);
}

export async function addOpportunityMemory(opportunityId: string, content: string): Promise<void> {
  return addMemoryToContainer(containers.opportunity(opportunityId), content);
}

export async function addCandidateFitMemory(
  opportunityId: string,
  builderId: string,
  content: string
): Promise<void> {
  return addMemoryToContainer(containers.candidateFit(opportunityId, builderId), content);
}

// ─── Prompt formatting ───────────────────────────────────────────────────────

export function formatMemoryForPrompt(profile: MemoryProfile | null): string {
  if (!profile) return '';
  const lines: string[] = [];
  if (profile.static.length > 0) {
    lines.push('Long-term memory about this user:');
    profile.static.slice(0, 8).forEach((s) => lines.push(`- ${s}`));
  }
  if (profile.dynamic.length > 0) {
    lines.push('Recent context:');
    profile.dynamic.slice(0, 5).forEach((d) => lines.push(`- ${d}`));
  }
  return lines.join('\n');
}

export function formatMultiMemoryForPrompt(params: {
  founderProfile?: MemoryProfile | null;
  builderProfile?: MemoryProfile | null;
  opportunityMemories?: string[];
  candidateFitMemories?: string[];
}): string {
  const sections: string[] = [];

  if (params.founderProfile) {
    const lines = [
      ...(params.founderProfile.static.slice(0, 5)),
      ...(params.founderProfile.dynamic.slice(0, 3)),
    ].map((s) => `- ${s}`);
    if (lines.length) sections.push('[Founder memory]\n' + lines.join('\n'));
  }

  if (params.builderProfile) {
    const lines = [
      ...(params.builderProfile.static.slice(0, 5)),
      ...(params.builderProfile.dynamic.slice(0, 3)),
    ].map((s) => `- ${s}`);
    if (lines.length) sections.push('[Builder memory]\n' + lines.join('\n'));
  }

  if (params.opportunityMemories?.length) {
    sections.push('[Role context]\n' + params.opportunityMemories.slice(0, 4).map((m) => `- ${m}`).join('\n'));
  }

  if (params.candidateFitMemories?.length) {
    sections.push('[Candidate feedback]\n' + params.candidateFitMemories.slice(0, 4).map((m) => `- ${m}`).join('\n'));
  }

  return sections.join('\n\n');
}
