import { generateOpenRouterReply } from '@/lib/openrouter';
import { braveDiscoverBuilderUrls, hasBraveSearchConfig } from '@/lib/talent/braveSearchClient';
import { exaSearch, hasExaConfig, type ExaResult } from '@/lib/talent/exaClient';
import { buildBuilderExaFingerprint } from '@/lib/talent/exaResearchCache';
import { crawlMarkdownFromUrl } from '@/lib/talent/builderEnrichment/crawlMarkdown';
import { fetchTopTwitterPosts, hasTwitterApiConfig, parseTwitterHandle } from '@/lib/talent/twitterApiClient';
import { rememberBuilderFact, type MemoryRef } from '@/lib/talent/builderAgentMemory';
import BuilderProfile from '@/models/talent/BuilderProfile';
import type { RuntimeEnv } from '@/lib/workosEnv';

export type DeepResearchResult = {
  summary: string;
  proofPoints: string[];
  signals: Array<{ label: string; detail: string; source?: string | null }>;
  suggestedQuestions: string[];
  discoveredLinks: {
    twitter?: string | null;
    personalWebsite?: string | null;
    devpost?: string | null;
    github?: string | null;
  };
  citations: string[];
  searchProviders?: Array<'brave' | 'exa'>;
  twitterPosts?: Array<{ url: string; text: string; likes: number }>;
  /** True when Exa was skipped because the builder identity fingerprint matched a prior run. */
  exaSkipped?: boolean;
  exaFingerprint?: string | null;
};

const EMPTY: DeepResearchResult = {
  summary: '',
  proofPoints: [],
  signals: [],
  suggestedQuestions: [],
  discoveredLinks: {},
  citations: [],
};

function buildIdentityFingerprint(builder: any, projects: any[]) {
  const { text } = buildBuilderExaFingerprint(builder, projects);
  const skills = Array.from(
    new Set(
      [
        ...(builder.experiences || []).flatMap((e: any) => e.skills || []),
        ...projects.flatMap((p: any) => p.techStack || []),
      ].filter(Boolean)
    )
  ).slice(0, 15);
  // Skills stay in the LLM context fingerprint but are intentionally excluded from
  // the Exa skip-hash so minor skill merges don't re-bill Exa.
  return skills.length ? `${text}\nSkills: ${skills.join(', ')}` : text;
}

function buildSearchQuery(builder: any) {
  const anchor = [builder.name, builder.universityOrCompany || builder.location]
    .filter(Boolean)
    .join(' ');
  const handle = (builder.links?.github || builder.links?.linkedin || '').split('/').filter(Boolean).pop();
  return `${anchor}${handle ? ` (${handle})` : ''} — Twitter/X, personal website, Devpost, GitHub projects and what they have built`;
}

function extractSocialUrl(url: string, kind: 'twitter' | 'devpost' | 'github'): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (kind === 'twitter' && (host === 'x.com' || host === 'twitter.com')) return url;
    if (kind === 'devpost' && host === 'devpost.com') return url;
    if (kind === 'github' && host === 'github.com') return url;
  } catch {
    return null;
  }
  return null;
}

function guessPersonalSite(url: string, builder: any): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (['github.com', 'linkedin.com', 'x.com', 'twitter.com', 'devpost.com'].some((h) => host.includes(h))) {
      return null;
    }
    const nameToken = String(builder.name || '')
      .toLowerCase()
      .split(/\s+/)[0];
    if (nameToken && host.includes(nameToken)) return url;
    if (/\.(dev|me|io|app|xyz|site|page)$/i.test(host)) return url;
  } catch {
    return null;
  }
  return null;
}

async function gatherSearchResults(
  builder: any,
  runtime?: RuntimeEnv,
  options?: { skipExa?: boolean; fingerprintHash?: string | null }
): Promise<{
  results: Array<{ title: string | null; url: string; highlights: string[]; provider?: 'brave' | 'exa' }>;
  via: 'brave' | 'exa' | 'both' | 'none';
  searchProviders: Array<'brave' | 'exa'>;
  exaSkipped: boolean;
}> {
  const braveEnabled = hasBraveSearchConfig(runtime);
  const exaConfigured = hasExaConfig(runtime);
  const skipExa = Boolean(options?.skipExa) || !exaConfigured;
  const searchProviders: Array<'brave' | 'exa'> = [];
  if (braveEnabled) searchProviders.push('brave');
  if (exaConfigured && !skipExa) searchProviders.push('exa');

  const [braveBundle, exaResults] = await Promise.all([
    braveEnabled
      ? braveDiscoverBuilderUrls(builder, { count: 8, runtime })
      : Promise.resolve({ results: [], urls: [] }),
    !skipExa
      ? exaSearch(buildSearchQuery(builder), { numResults: 5, category: 'people' }, runtime).catch((err) => {
          console.warn('[deepResearch] exa search failed', err);
          return [] as ExaResult[];
        })
      : Promise.resolve([] as ExaResult[]),
  ]);

  const mapped: Array<{ title: string | null; url: string; highlights: string[]; provider?: 'brave' | 'exa' }> = [];
  let via: 'brave' | 'exa' | 'both' | 'none' = 'none';

  if (braveBundle.results.length) {
    via = 'brave';
    mapped.push(
      ...braveBundle.results.map((r) => ({
        title: r.title,
        url: r.url,
        highlights: r.description ? [r.description] : [],
        provider: 'brave' as const,
      }))
    );
  }

  if (exaResults.length) {
    via = via === 'brave' ? 'both' : 'exa';
    for (const r of exaResults) {
      if (!mapped.some((m) => m.url === r.url)) {
        mapped.push({ title: r.title, url: r.url, highlights: r.highlights, provider: 'exa' });
      }
    }
  }

  console.info('[deepResearch] web search', {
    providers: searchProviders,
    braveResults: braveBundle.results.length,
    exaResults: exaResults.length,
    exaSkipped: skipExa && exaConfigured,
    fingerprint: options?.fingerprintHash || null,
    merged: mapped.length,
    via,
  });

  return {
    results: mapped.slice(0, 12),
    via,
    searchProviders,
    exaSkipped: Boolean(skipExa && exaConfigured),
  };
}

/**
 * Deep-research a builder from PUBLIC signals — Brave Search + Exa (both when configured),
 * recursive markdown crawl on top URLs, and Twitter API posts when configured.
 */
export async function deepResearchBuilder(params: {
  builder: any;
  projects: any[];
  memRef?: MemoryRef;
  numResults?: number;
  runtime?: RuntimeEnv;
  /** Force a fresh Exa people search even if fingerprint matches. */
  forceExa?: boolean;
  onProgress?: (brief: string) => void | Promise<void>;
}): Promise<DeepResearchResult> {
  const { builder, projects, runtime } = params;
  if (!builder?.name) return EMPTY;
  if (!hasBraveSearchConfig(runtime) && !hasExaConfig(runtime)) return EMPTY;

  const fingerprint = buildIdentityFingerprint(builder, projects);
  const { hash: fingerprintHash } = buildBuilderExaFingerprint(builder, projects);
  const priorHash = builder?.enrichmentInsights?.exaResearch?.fingerprint || null;
  const skipExa = !params.forceExa && Boolean(priorHash && priorHash === fingerprintHash);

  await params.onProgress?.(
    skipExa
      ? `Searching the web for ${builder.name} (Brave)`
      : `Searching the web for ${builder.name} (Brave + Exa)`
  );
  const { results, via, searchProviders, exaSkipped } = await gatherSearchResults(builder, runtime, {
    skipExa,
    fingerprintHash,
  });
  if (!results.length) {
    console.warn('[deepResearch] no web search results', { searchProviders, exaSkipped });
    return { ...EMPTY, searchProviders, exaSkipped, exaFingerprint: fingerprintHash };
  }

  await params.onProgress?.(`Found ${results.length} web results for ${builder.name}`);
  const citations = results.map((r) => r.url).filter(Boolean).slice(0, 8);

  const seedUrls = [
    ...citations.slice(0, 4),
    builder.links?.portfolio,
    builder.links?.personalWebsite,
    builder.links?.devpost,
  ]
    .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

  const uniqueSeeds = [...new Set(seedUrls)].slice(0, 3);
  const crawledChunks: string[] = [];

  for (const url of uniqueSeeds) {
    await params.onProgress?.(`Crawling ${url}`);
    const { combinedMarkdown, pages } = await crawlMarkdownFromUrl(url, {
      maxDepth: 2,
      maxPages: 6,
      maxCharsPerPage: 4000,
    });
    if (combinedMarkdown) {
      crawledChunks.push(combinedMarkdown);
      await params.onProgress?.(
        `Read ${pages.length || 1} page${(pages.length || 1) === 1 ? '' : 's'} from ${url}`
      );
    } else if (pages.length) {
      crawledChunks.push(pages.map((p) => `[${p.url}]\n${p.markdown}`).join('\n\n'));
      await params.onProgress?.(`Read ${pages.length} pages from ${url}`);
    }
  }

  const pageText = crawledChunks.join('\n\n---\n\n').slice(0, 18000);

  const excerpts = results
    .map((r, i) => `[${i + 1}] ${r.title || r.url}\nURL: ${r.url}\n${r.highlights.join(' … ')}`)
    .join('\n\n')
    .slice(0, 8000);

  let twitterPosts: DeepResearchResult['twitterPosts'];
  const twitterUrl = builder.links?.twitter;
  if (twitterUrl && hasTwitterApiConfig(runtime)) {
    const handle = parseTwitterHandle(twitterUrl);
    await params.onProgress?.(`Fetching X posts for ${handle ? `@${handle}` : twitterUrl}`);
    const { posts } = await fetchTopTwitterPosts(handle || twitterUrl, { limit: 4, runtime });
    twitterPosts = posts.map((p) => ({ url: p.url, text: p.text.slice(0, 280), likes: p.likeCount }));
  }

  const twitterBlock = twitterPosts?.length
    ? `\n\nTwitter posts (API):\n${twitterPosts.map((p, i) => `[T${i + 1}] ${p.url} (${p.likes} likes)\n${p.text}`).join('\n\n')}`
    : '';

  let raw = '';
  try {
    await params.onProgress?.(`Synthesizing founder-facing dossier for ${builder.name}`);
    raw = await generateOpenRouterReply({
      systemPrompt: `You are a talent researcher building a founder-ready dossier on ONE builder from web-search excerpts + scraped pages + optional Twitter posts.
Match results to THIS person (handles, employer, school, projects); IGNORE namesakes.
Find proof-of-work: shipped products, OSS, hackathons, talks, press. Pull X/Twitter, personal site, Devpost, GitHub if present.
Be skeptical — only assert what the sources support.

Return STRICT JSON:
{
  "summary": string,
  "proofPoints": string[],
  "signals": [ { "label": string, "detail": string, "source": string|null } ],
  "discoveredLinks": { "twitter": string|null, "personalWebsite": string|null, "devpost": string|null, "github": string|null },
  "suggestedQuestions": string[]
}`,
      userPrompt: `Identity fingerprint:\n${fingerprint}\n\nSearch (${via}):\n${excerpts}\n\nScraped pages (markdown, up to 2 link-depth):\n${pageText || '(none)'}${twitterBlock}`,
      temperature: 0.1,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });
  } catch (err) {
    console.warn('[deepResearch] synthesis failed', err);
    return { ...EMPTY, citations, twitterPosts };
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    parsed = {};
  }

  const discoveredLinks = {
    twitter:
      typeof parsed.discoveredLinks?.twitter === 'string'
        ? parsed.discoveredLinks.twitter
        : citations.map((u) => extractSocialUrl(u, 'twitter')).find(Boolean) || null,
    personalWebsite:
      typeof parsed.discoveredLinks?.personalWebsite === 'string'
        ? parsed.discoveredLinks.personalWebsite
        : citations.map((u) => guessPersonalSite(u, builder)).find(Boolean) || null,
    devpost:
      typeof parsed.discoveredLinks?.devpost === 'string'
        ? parsed.discoveredLinks.devpost
        : citations.map((u) => extractSocialUrl(u, 'devpost')).find(Boolean) || null,
    github:
      typeof parsed.discoveredLinks?.github === 'string'
        ? parsed.discoveredLinks.github
        : citations.map((u) => extractSocialUrl(u, 'github')).find(Boolean) || null,
  };

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
    discoveredLinks,
    citations,
    searchProviders,
    twitterPosts,
    exaSkipped,
    exaFingerprint: fingerprintHash,
  };

  if (params.memRef) {
    for (const point of result.proofPoints.slice(0, 5)) {
      await rememberBuilderFact(params.memRef, { content: `Research proof: ${point}`, kind: 'context', field: 'proof' });
    }
    for (const post of result.twitterPosts?.slice(0, 3) || []) {
      await rememberBuilderFact(params.memRef, {
        content: `Twitter (${post.likes} likes): ${post.text}`,
        kind: 'context',
        field: 'proof',
      });
    }
  }

  // Persist Exa fingerprint so the next enrich with unchanged identity skips Exa billing.
  const builderId = builder?._id || builder?.id;
  if (builderId && (!exaSkipped || !priorHash)) {
    try {
      await BuilderProfile.findByIdAndUpdate(builderId, {
        $set: {
          'enrichmentInsights.exaResearch': {
            fingerprint: fingerprintHash,
            searchedAt: new Date(),
            citationCount: citations.length,
            providers: searchProviders,
            skipped: exaSkipped,
          },
          'enrichmentInsights.updatedAt': new Date(),
        },
      });
    } catch (err) {
      console.warn('[deepResearch] failed to persist exa fingerprint', err);
    }
  } else if (builderId && exaSkipped) {
    try {
      await BuilderProfile.findByIdAndUpdate(builderId, {
        $set: {
          'enrichmentInsights.exaResearch.skipped': true,
          'enrichmentInsights.exaResearch.providers': searchProviders,
          'enrichmentInsights.updatedAt': new Date(),
        },
      });
    } catch {
      // non-fatal
    }
  }

  return result;
}
