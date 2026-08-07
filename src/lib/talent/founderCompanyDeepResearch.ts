import { generateOpenRouterReply } from '@/lib/openrouter';
import { braveWebSearch, hasBraveSearchConfig } from '@/lib/talent/braveSearchClient';
import { exaSearch, hasExaConfig } from '@/lib/talent/exaClient';
import { crawlMarkdownFromUrl } from '@/lib/talent/builderEnrichment/crawlMarkdown';
import {
  companyResearchCacheKey,
  isCompanyResearchFresh,
} from '@/lib/talent/exaResearchCache';
import CompanyResearchCache from '@/models/talent/CompanyResearchCache';
import type { RuntimeEnv } from '@/lib/workosEnv';

export type CompanyDeepResearchResult = {
  description: string;
  whatTheyBuild: string;
  highlights: string[];
  citations: string[];
  searchProviders: Array<'brave' | 'exa'>;
  website?: string | null;
  cacheHit?: boolean;
  cacheKey?: string | null;
};

const EMPTY: CompanyDeepResearchResult = {
  description: '',
  whatTheyBuild: '',
  highlights: [],
  citations: [],
  searchProviders: [],
  website: null,
  cacheHit: false,
  cacheKey: null,
};

function buildCompanyQuery(name: string, website?: string | null) {
  const site = website?.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return `${name}${site ? ` ${site}` : ''} startup company what they build product mission`;
}

function guessWebsiteFromCitations(citations: string[], companyName: string): string | null {
  const nameToken = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const url of citations) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (['linkedin.com', 'crunchbase.com', 'wikipedia.org', 'twitter.com', 'x.com', 'facebook.com'].some((h) => host.includes(h))) {
        continue;
      }
      const hostKey = host.replace(/[^a-z0-9]+/g, '');
      if (nameToken && hostKey.includes(nameToken.slice(0, Math.min(6, nameToken.length)))) {
        return `https://${host}`;
      }
    } catch {
      // skip
    }
  }
  return null;
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
  /** Skip cache read (still writes after). */
  forceRefresh?: boolean;
}): Promise<CompanyDeepResearchResult> {
  const { name, website, runtime, timeoutMs = 35_000, forceRefresh = false } = params;
  if (!name.trim()) return EMPTY;

  const cacheKey = companyResearchCacheKey({
    name,
    website,
    linkedInUrl: params.linkedInUrl,
  });

  if (cacheKey && !forceRefresh) {
    try {
      const cached = await CompanyResearchCache.findOne({ cacheKey }).lean();
      if (cached && isCompanyResearchFresh(cached.researchedAt) && (cached.description || cached.whatTheyBuild)) {
        await CompanyResearchCache.updateOne({ cacheKey }, { $inc: { hitCount: 1 } }).catch(() => null);
        console.info('[companyDeepResearch] cache hit', { cacheKey, hitCount: (cached.hitCount || 0) + 1 });
        return {
          description: cached.description || '',
          whatTheyBuild: cached.whatTheyBuild || '',
          highlights: Array.isArray(cached.highlights) ? cached.highlights : [],
          citations: Array.isArray(cached.citations) ? cached.citations : [],
          searchProviders: Array.isArray(cached.searchProviders) ? cached.searchProviders : [],
          website: cached.website || website || null,
          cacheHit: true,
          cacheKey,
        };
      }
    } catch (err) {
      console.warn('[companyDeepResearch] cache read failed', err);
    }
  }

  const fresh = await withTimeout(
    runDeepResearch({ name, website, linkedInUrl: params.linkedInUrl, runtime }),
    timeoutMs,
    'company deep research'
  );

  if (cacheKey && (fresh.description || fresh.whatTheyBuild || fresh.citations.length)) {
    try {
      await CompanyResearchCache.findOneAndUpdate(
        { cacheKey },
        {
          $set: {
            cacheKey,
            name,
            website: fresh.website || website || null,
            linkedInUrl: params.linkedInUrl || null,
            description: fresh.description,
            whatTheyBuild: fresh.whatTheyBuild,
            highlights: fresh.highlights,
            citations: fresh.citations,
            searchProviders: fresh.searchProviders,
            researchedAt: new Date(),
          },
          $setOnInsert: { hitCount: 0 },
        },
        { upsert: true }
      );
      console.info('[companyDeepResearch] cache write', { cacheKey, providers: fresh.searchProviders });
    } catch (err) {
      console.warn('[companyDeepResearch] cache write failed', err);
    }
  }

  return { ...fresh, cacheHit: false, cacheKey };
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

  const inferredWebsite = website || guessWebsiteFromCitations(citations, name);
  const crawlTarget = inferredWebsite?.startsWith('http')
    ? inferredWebsite
    : inferredWebsite
      ? `https://${inferredWebsite}`
      : citations[0];
  let pageText = '';
  if (crawlTarget) {
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
  "highlights": string[],
  "website": string|null
}
description: 2-4 sentences about the company.
whatTheyBuild: one clear sentence on their product or mission.
highlights: up to 4 short bullets founders care about (stage, customers, tech, traction).
website: official company website if clearly present, else null.`,
      userPrompt: `Company: ${name}\nWebsite: ${website || '(unknown)'}\nLinkedIn: ${params.linkedInUrl || '(unknown)'}\n\nSearch:\n${excerpts}\n\nScraped:\n${pageText || '(none)'}`,
      temperature: 0.1,
      maxTokens: 700,
      responseFormat: 'json_object',
    });
  } catch (err) {
    console.warn('[companyDeepResearch] synthesis failed', err);
    return { ...EMPTY, citations, searchProviders, website: inferredWebsite };
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    parsed = {};
  }

  const parsedWebsite =
    typeof parsed.website === 'string' && /^https?:\/\//i.test(parsed.website.trim())
      ? parsed.website.trim()
      : inferredWebsite;

  return {
    description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
    whatTheyBuild: typeof parsed.whatTheyBuild === 'string' ? parsed.whatTheyBuild.trim() : '',
    highlights: Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((h: unknown) => typeof h === 'string').slice(0, 4)
      : [],
    citations,
    searchProviders,
    website: parsedWebsite,
    cacheHit: false,
  };
}
