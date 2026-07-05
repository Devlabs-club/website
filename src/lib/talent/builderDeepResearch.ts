import { generateOpenRouterReply } from '@/lib/openrouter';
import { exaSearch, hasExaConfig, type ExaResult } from '@/lib/talent/exaClient';
import { rememberBuilderFact, type MemoryRef } from '@/lib/talent/builderAgentMemory';
import type { RuntimeEnv } from '@/lib/workosEnv';

export type DeepResearchResult = {
  summary: string;
  proofPoints: string[];
  signals: Array<{ label: string; detail: string; source?: string | null }>;
  suggestedQuestions: string[];
  discoveredLinks: { twitter?: string | null; personalWebsite?: string | null; devpost?: string | null };
  citations: string[];
};

const EMPTY: DeepResearchResult = {
  summary: '',
  proofPoints: [],
  signals: [],
  suggestedQuestions: [],
  discoveredLinks: {},
  citations: [],
};

/** Build a tight identity fingerprint from everything we already know. */
function buildIdentityFingerprint(builder: any, projects: any[]) {
  const lines: string[] = [];
  if (builder.name) lines.push(`Name: ${builder.name}`);
  if (builder.location) lines.push(`Location: ${builder.location}`);
  if (builder.universityOrCompany) lines.push(`School/Company: ${builder.universityOrCompany}`);
  if (builder.headline) lines.push(`Headline: ${builder.headline}`);
  if (builder.links?.github) lines.push(`GitHub: ${builder.links.github}`);
  if (builder.links?.linkedin) lines.push(`LinkedIn: ${builder.links.linkedin}`);
  if (builder.links?.portfolio) lines.push(`Portfolio: ${builder.links.portfolio}`);
  if (builder.links?.devpost) lines.push(`Devpost: ${builder.links.devpost}`);
  const exps = (builder.experiences || []).slice(0, 4).map((e: any) => `${e.title} @ ${e.company}`);
  if (exps.length) lines.push(`Experience: ${exps.join('; ')}`);
  const projs = projects.slice(0, 5).map((p: any) => p.projectName).filter(Boolean);
  if (projs.length) lines.push(`Projects: ${projs.join('; ')}`);
  const skills = Array.from(
    new Set(
      [
        ...(builder.experiences || []).flatMap((e: any) => e.skills || []),
        ...projects.flatMap((p: any) => p.techStack || []),
      ].filter(Boolean)
    )
  ).slice(0, 15);
  if (skills.length) lines.push(`Skills: ${skills.join(', ')}`);
  return lines.join('\n');
}

/** A short, specific query string to anchor the web search to THIS person. */
function buildSearchQuery(builder: any) {
  const anchor = [builder.name, builder.universityOrCompany || builder.location]
    .filter(Boolean)
    .join(' ');
  const handle = (builder.links?.github || builder.links?.linkedin || '').split('/').filter(Boolean).pop();
  return `${anchor}${handle ? ` (${handle})` : ''} — Twitter/X, personal website, Devpost, projects and what they have built`;
}

/**
 * Deep-research a builder from PUBLIC signals using Exa — cheaply.
 *
 * ONE Exa `/search` (type auto, highlights only, small numResults) gathers their
 * web presence (X/Twitter, personal site, Devpost, press), then ONE cheap LLM
 * synthesis turns the excerpts into founder-grade proof points, discovered
 * links, and the sharpest follow-up questions. No `deep`/`outputSchema` — we get
 * "enough to know them" without burning credits.
 */
export async function deepResearchBuilder(params: {
  builder: any;
  projects: any[];
  memRef?: MemoryRef;
  numResults?: number;
  runtime?: RuntimeEnv;
}): Promise<DeepResearchResult> {
  const { builder, projects, runtime } = params;
  if (!hasExaConfig(runtime)) return EMPTY;
  if (!builder?.name) return EMPTY;

  const fingerprint = buildIdentityFingerprint(builder, projects);

  let results: ExaResult[] = [];
  try {
    results = await exaSearch(buildSearchQuery(builder), { numResults: params.numResults ?? 5 }, runtime);
  } catch (err) {
    console.warn('[deepResearch] exa search failed', err);
    return EMPTY;
  }
  if (!results.length) return EMPTY;

  const citations = results.map((r) => r.url).filter(Boolean).slice(0, 6);

  const { urlsToMarkdown } = await import('@/lib/talent/urlToMarkdown');
  const pages = await urlsToMarkdown(citations.slice(0, 4), 5000);
  const pageText = pages.map((p) => `[${p.url}]\n${p.markdown}`).join('\n\n').slice(0, 16000);

  const excerpts = results
    .map((r, i) => `[${i + 1}] ${r.title || r.url}\nURL: ${r.url}\n${r.highlights.join(' … ')}`)
    .join('\n\n')
    .slice(0, 8000);

  let raw = '';
  try {
    raw = await generateOpenRouterReply({
      systemPrompt: `You are a talent researcher building a founder-ready dossier on ONE builder from web-search excerpts.
You get an identity fingerprint + numbered search results. Match results to THIS person (handles, employer, school, projects); IGNORE namesakes and anything you can't tie to them.
Find proof-of-work a founder cares about: shipped/launched products, real users/revenue, notable OSS, hackathon wins, talks, press, communities. Also pull out their X/Twitter, personal website, and Devpost if present in the results.
Be skeptical — only assert what the excerpts support; never invent.

Return STRICT JSON:
{
  "summary": string,                       // 2-3 sentence founder-facing read on who they are + their edge ('' if you can't confirm identity)
  "proofPoints": string[],                 // 3-6 concrete verifiable proof points (each tied to a result)
  "signals": [ { "label": string, "detail": string, "source": string|null } ],
  "discoveredLinks": { "twitter": string|null, "personalWebsite": string|null, "devpost": string|null },
  "suggestedQuestions": string[]           // 3-5 sharp follow-ups that would most strengthen the profile; ask only what's NOT already known/found
}`,
      userPrompt: `Identity fingerprint:\n${fingerprint}\n\nSearch excerpts:\n${excerpts}\n\nFull page content (markdown):\n${pageText || '(none)'}`,
      temperature: 0.1,
      maxTokens: 1100,
      responseFormat: 'json_object',
    });
  } catch (err) {
    console.warn('[deepResearch] synthesis failed', err);
    return { ...EMPTY, citations };
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    parsed = {};
  }

  const result: DeepResearchResult = {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    proofPoints: Array.isArray(parsed.proofPoints) ? parsed.proofPoints.filter((p: unknown) => typeof p === 'string').slice(0, 6) : [],
    signals: Array.isArray(parsed.signals)
      ? parsed.signals
          .filter((s: any) => s && typeof s.label === 'string')
          .map((s: any) => ({ label: s.label, detail: String(s.detail || ''), source: s.source || null }))
          .slice(0, 6)
      : [],
    suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
      ? parsed.suggestedQuestions.filter((q: unknown) => typeof q === 'string').slice(0, 5)
      : [],
    discoveredLinks: {
      twitter: typeof parsed.discoveredLinks?.twitter === 'string' ? parsed.discoveredLinks.twitter : null,
      personalWebsite: typeof parsed.discoveredLinks?.personalWebsite === 'string' ? parsed.discoveredLinks.personalWebsite : null,
      devpost: typeof parsed.discoveredLinks?.devpost === 'string' ? parsed.discoveredLinks.devpost : null,
    },
    citations,
  };

  // Persist the strongest findings so the agent never re-discovers or re-asks.
  if (params.memRef) {
    for (const point of result.proofPoints.slice(0, 5)) {
      await rememberBuilderFact(params.memRef, { content: `Research proof: ${point}`, kind: 'context', field: 'proof' });
    }
  }

  return result;
}
