import { generateOpenRouterReply } from '@/lib/openrouter';
import { braveWebSearch, hasBraveSearchConfig } from '@/lib/talent/braveSearchClient';
import { exaSearch, hasExaConfig } from '@/lib/talent/exaClient';
import { crawlMarkdownFromUrl } from '@/lib/talent/builderEnrichment/crawlMarkdown';
import type { RuntimeEnv } from '@/lib/workosEnv';

export type CompanyDeepResearchResult = {
  description: string;
  whatTheyBuild: string;
  highlights: string[];
  citations: string[];
  searchProviders: Array<'brave' | 'exa'>;
};

const EMPTY: CompanyDeepResearchResult = {
  description: '',
  whatTheyBuild: '',
  highlights: [],
  citations: [],
  searchProviders: [],
};

function buildCompanyQuery(name: string, website?: string | null) {
  const site = website?.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return `${name}${site ? ` ${site}` : ''} startup company what they build product mission`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function deepResearchCompany(params: {
  name: string;
  website?: string | null;
  linkedInUrl?: string | null;
  runtime?: RuntimeEnv;
  /** Hard cap so caller APIs never hit the Vercel platform timeout. */
  timeoutMs?: number;
}): Promise<CompanyDeepResearchResult> {
  const { name, website, runtime, timeoutMs = 35_000 } = params;
  if (!name.trim()) return EMPTY;

  return withTimeout(runDeepResearch({ name, website, linkedInUrl: params.linkedInUrl, runtime }), timeoutMs, 'company deep research');
}

async function runDeepResearch(params: {
  name: string;
  website?: string | null;
  linkedInUrl?: string | null;
  runtime?: RuntimeEnv;
}): Promise<CompanyDeepResearchResult> {
  const { name, website, runtime } = params;

  const searchProviders: Array<'brave' | 'exa'> = [];
  if (hasBraveSearchConfig(runtime)) searchProviders.push('brave');
  if (hasExaConfig(runtime)) searchProviders.push('exa');
  if (!searchProviders.length) return EMPTY;

  const query = buildCompanyQuery(name, website);
  const [braveResults, exaResults] = await Promise.all([
    hasBraveSearchConfig(runtime) ? braveWebSearch(query, { count: 6, runtime }) : Promise.resolve([]),
    hasExaConfig(runtime)
      ? exaSearch(query, { numResults: 4, category: 'company' }, runtime).catch(() => [])
      : Promise.resolve([]),
  ]);

  const merged: Array<{ title: string | null; url: string; highlights: string[] }> = [];
  for (const r of braveResults) {
    merged.push({ title: r.title, url: r.url, highlights: r.description ? [r.description] : [] });
  }
  for (const r of exaResults) {
    if (!merged.some((m) => m.url === r.url)) {
      merged.push({ title: r.title, url: r.url, highlights: r.highlights });
    }
  }

  const citations = merged.map((r) => r.url).filter(Boolean).slice(0, 6);
  if (!citations.length) return { ...EMPTY, searchProviders };

  const crawlTarget = website?.startsWith('http') ? website : citations[0];
  let pageText = '';
  if (crawlTarget) {
    // Keep crawl light — this path sits behind Vercel onboarding APIs.
    const { combinedMarkdown } = await crawlMarkdownFromUrl(crawlTarget, {
      maxDepth: 0,
      maxPages: 2,
      maxCharsPerPage: 2500,
    });
    pageText = combinedMarkdown.slice(0, 8000);
  }

  const excerpts = merged
    .map((r, i) => `[${i + 1}] ${r.title || r.url}\nURL: ${r.url}\n${r.highlights.join(' … ')}`)
    .join('\n\n')
    .slice(0, 5000);

  let raw = '';
  try {
    raw = await generateOpenRouterReply({
      systemPrompt: `You research startups for a founder onboarding flow. Use ONLY the provided search excerpts and scraped page text.
Return STRICT JSON:
{
  "description": string,
  "whatTheyBuild": string,
  "highlights": string[]
}
description: 2-4 sentences about the company.
whatTheyBuild: one clear sentence on their product or mission.
highlights: up to 4 short bullets founders care about (stage, customers, tech, traction).`,
      userPrompt: `Company: ${name}\nWebsite: ${website || '(unknown)'}\nLinkedIn: ${params.linkedInUrl || '(unknown)'}\n\nSearch:\n${excerpts}\n\nScraped:\n${pageText || '(none)'}`,
      temperature: 0.1,
      maxTokens: 700,
      responseFormat: 'json_object',
    });
  } catch (err) {
    console.warn('[companyDeepResearch] synthesis failed', err);
    return { ...EMPTY, citations, searchProviders };
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    parsed = {};
  }

  return {
    description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
    whatTheyBuild: typeof parsed.whatTheyBuild === 'string' ? parsed.whatTheyBuild.trim() : '',
    highlights: Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((h: unknown) => typeof h === 'string').slice(0, 4)
      : [],
    citations,
    searchProviders,
  };
}
