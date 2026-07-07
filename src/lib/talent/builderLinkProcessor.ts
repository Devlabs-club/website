import { generateOpenRouterReply } from '@/lib/openrouter';
import { crawlMarkdownFromUrl } from '@/lib/talent/builderEnrichment/crawlMarkdown';
import { fetchUrlMarkdown, fetchAuthenticatedPageText, normalizeUrl } from '@/lib/talent/builderEnrichment/urlToMarkdown';
import { updateLinks } from '@/lib/agent/builderProfileTools';
import { rememberBuilderFact, type MemoryRef } from '@/lib/talent/builderAgentMemory';

const TLDS = [
  'com', 'dev', 'io', 'ai', 'me', 'co', 'app', 'xyz', 'net', 'org', 'gg', 'so',
  'tech', 'club', 'page', 'site', 'build', 'design', 'to', 'sh', 'fyi', 'link',
].join('|');

const URL_RE = new RegExp(`\\b(https?:\\/\\/[^\\s]+|(?:[a-z0-9-]+\\.)+(?:${TLDS})(?:\\/[^\\s]*)?)`, 'gi');

/** Pull every URL / bare domain out of a chat message. */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[1].replace(/[.,;:!?)\]]+$/, '').trim();
    const normalized = normalizeUrl(raw);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

export type LinkKind = 'github' | 'linkedin' | 'devpost' | 'twitter' | 'generic';

export function classifyLink(url: string): LinkKind {
  let host = '';
  try {
    host = new URL(normalizeUrl(url) || url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'generic';
  }
  if (host === 'github.com') return 'github';
  if (host.endsWith('linkedin.com')) return 'linkedin';
  if (host === 'devpost.com') return 'devpost';
  if (host === 'twitter.com' || host === 'x.com') return 'twitter';
  return 'generic';
}

export type ProcessedLink = {
  url: string;
  ok: boolean;
  coolFacts: string[];
  applied: string[];
  summary: string;
};

/**
 * Fetch and understand ANY link the builder drops (personal site, blog, X,
 * project page, article about them). Saves discovered links, remembers the
 * surprising bits, and returns "cool facts" the agent can casually drop later —
 * without ever telling the builder it scraped anything.
 */
export async function processGenericLink(builder: any, url: string, memRef: MemoryRef): Promise<ProcessedLink> {
  const normalized = normalizeUrl(url) || url;
  const result: ProcessedLink = { url: normalized, ok: false, coolFacts: [], applied: [], summary: '' };

  // Fetch page content — crawl outbound links up to 2 depth when markdown is available.
  let content = '';
  const crawled = await crawlMarkdownFromUrl(normalized, { maxDepth: 2, maxPages: 7, maxCharsPerPage: 4500 });
  if (crawled.combinedMarkdown) {
    content = crawled.combinedMarkdown;
  } else {
    const md = await fetchUrlMarkdown(normalized, 'builder link', 6000);
    if (md?.markdown) content = md.markdown;
  }
  if (!content) content = (await fetchAuthenticatedPageText(normalized, { maxChars: 6000 })) || '';
  if (!content || content.length < 80) return result;

  let raw = '';
  try {
    raw = await generateOpenRouterReply({
      systemPrompt: `You read a web page a builder shared and pull out what matters for their DevLabs profile.
Return STRICT JSON:
{
  "isAboutBuilder": boolean,
  "summary": string,                  // one line: what this page is
  "coolFacts": string[],              // 1-3 SPECIFIC, concrete, surprising things a founder would care about: shipped products, real numbers/users, awards/wins, notable orgs, standout projects. No fluff, no vague adjectives.
  "skills": string[],                 // concrete technical skills evidenced
  "discoveredLinks": { "twitter": string|null, "personalWebsite": string|null, "github": string|null, "linkedin": string|null, "devpost": string|null },
  "suggestedHeadline": string|null,   // grounded + concrete, what they actually build/ship. NO buzzwords (no "passionate", "process-focused", "community-first", "innovative", "technologist", "loves connecting").
  "suggestedBio": string|null         // 1-2 sentences, founder-facing, concrete proof-of-work. Same no-buzzword rule.
}
Only include facts the page supports. Empty arrays / null when unknown.`,
      userPrompt: `URL: ${normalized}\n\nPage content:\n${content}`,
      temperature: 0.1,
      maxTokens: 800,
      responseFormat: 'json_object',
    });
  } catch {
    return result;
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    return result;
  }

  result.ok = true;
  result.summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  result.coolFacts = Array.isArray(parsed.coolFacts) ? parsed.coolFacts.filter((f: unknown) => typeof f === 'string').slice(0, 3) : [];

  // Save any links we discovered (only if not already set).
  const dl = parsed.discoveredLinks || {};
  const linkUpdates: Record<string, string> = {};
  for (const key of ['twitter', 'personalWebsite', 'github', 'linkedin', 'devpost'] as const) {
    if (typeof dl[key] === 'string' && dl[key].trim() && !builder.links?.[key]) linkUpdates[key] = dl[key].trim();
  }
  if (Object.keys(linkUpdates).length) {
    try {
      await updateLinks(builder, linkUpdates);
      result.applied.push(...Object.keys(linkUpdates));
    } catch { /* ignore */ }
  }

  // Remember the surprising bits + suggestions so the agent can use them later.
  for (const fact of result.coolFacts) {
    await rememberBuilderFact(memRef, { content: `From ${normalized}: ${fact}`, kind: 'context', field: 'proof' });
  }
  if (typeof parsed.suggestedBio === 'string' && parsed.suggestedBio.trim()) {
    await rememberBuilderFact(memRef, { content: `Bio idea (grounded, no buzzwords): ${parsed.suggestedBio.trim()}`, kind: 'todo', field: 'bio' });
  }

  const parsedSkills = Array.isArray(parsed.skills)
    ? parsed.skills.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 16)
    : [];
  if (parsedSkills.length) {
    const existing = builder.skills || [];
    const merged = [...new Set([...existing, ...parsedSkills])].slice(0, 32);
    if (merged.length > existing.length) {
      builder.skills = merged;
      await builder.save();
      result.applied.push(`${merged.length - existing.length} skills`);
    }
  }

  return result;
}

/** Dry-run generic link scrape — same extraction as processGenericLink, no DB/memory writes. */
export async function probeGenericLink(url: string): Promise<ProcessedLink & { skills?: string[]; discoveredLinks?: Record<string, string | null> }> {
  const normalized = normalizeUrl(url) || url;
  const result: ProcessedLink & { skills?: string[]; discoveredLinks?: Record<string, string | null> } = {
    url: normalized,
    ok: false,
    coolFacts: [],
    applied: [],
    summary: '',
  };

  let content = '';
  const crawled = await crawlMarkdownFromUrl(normalized, { maxDepth: 2, maxPages: 7, maxCharsPerPage: 4500 });
  if (crawled.combinedMarkdown) {
    content = crawled.combinedMarkdown;
  } else {
    const md = await fetchUrlMarkdown(normalized, 'builder link', 6000);
    if (md?.markdown) content = md.markdown;
  }
  if (!content) content = (await fetchAuthenticatedPageText(normalized, { maxChars: 6000 })) || '';
  if (!content || content.length < 80) return result;

  let raw = '';
  try {
    raw = await generateOpenRouterReply({
      systemPrompt: `You read a web page a builder shared and pull out what matters for their DevLabs profile.
Return STRICT JSON:
{
  "isAboutBuilder": boolean,
  "summary": string,
  "coolFacts": string[],
  "skills": string[],
  "discoveredLinks": { "twitter": string|null, "personalWebsite": string|null, "github": string|null, "linkedin": string|null, "devpost": string|null },
  "suggestedHeadline": string|null,
  "suggestedBio": string|null
}
Only include facts the page supports. Empty arrays / null when unknown.`,
      userPrompt: `URL: ${normalized}\n\nPage content:\n${content}`,
      temperature: 0.1,
      maxTokens: 800,
      responseFormat: 'json_object',
    });
  } catch {
    return result;
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    return result;
  }

  result.ok = true;
  result.summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  result.coolFacts = Array.isArray(parsed.coolFacts) ? parsed.coolFacts.filter((f: unknown) => typeof f === 'string').slice(0, 3) : [];
  result.skills = Array.isArray(parsed.skills)
    ? parsed.skills.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 16)
    : [];
  result.discoveredLinks = parsed.discoveredLinks || {};
  return result;
}
