import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import { exaSearch, hasExaConfig } from '@/lib/talent/exaClient';
import type { EnrichedProfileDraft, SourceEnrichmentResult } from './types';

function twitterHandle(url: string) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(parsed.hostname.toLowerCase())) return '';
    return parsed.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';
  } catch {
    return '';
  }
}

function parseJson(raw: string) {
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    return null;
  }
}

export async function enrichFromTwitter(builder: any): Promise<SourceEnrichmentResult> {
  const twitterUrl = builder?.links?.twitter;
  if (!twitterUrl) return { source: 'twitter', errors: ['no_twitter_url'] };
  if (!hasExaConfig()) return { source: 'twitter', errors: ['exa_not_configured'] };

  const handle = twitterHandle(twitterUrl);
  const query = [
    builder?.name,
    handle ? `@${handle}` : twitterUrl,
    'X Twitter builder projects launches shipped work',
  ].filter(Boolean).join(' ');

  let results = [];
  try {
    results = await exaSearch(query, { numResults: 4, includeDomains: ['x.com', 'twitter.com'] });
  } catch (err) {
    return { source: 'twitter', errors: [err instanceof Error ? err.message : 'twitter_search_failed'] };
  }

  if (!results.length) {
    return { source: 'twitter', profile: { links: { twitter: twitterUrl } }, errors: ['no_twitter_results'] };
  }
  if (!hasOpenRouterConfig()) {
    return { source: 'twitter', profile: { links: { twitter: twitterUrl } }, errors: ['openrouter_not_configured'] };
  }

  const excerpts = results
    .map((r, i) => `[${i + 1}] ${r.title || r.url}\nURL: ${r.url}\n${r.highlights.join(' ... ')}`)
    .join('\n\n')
    .slice(0, 5000);

  let parsed: any = null;
  try {
    const raw = await generateOpenRouterReply({
      systemPrompt: `You extract useful builder-profile signal from X/Twitter search excerpts.
Only use facts that clearly match this builder. Ignore namesakes and vague hype.
Return STRICT JSON:
{
  "headline": string|null,
  "bio": string|null,
  "skills": string[],
  "signals": string[]
}
Headline/bio must be concrete proof-of-work, not buzzwords. signals should be 1-4 short facts about shipped work, public projects, launches, communities, or technical interests.`,
      userPrompt: `Builder: ${builder?.name || 'unknown'}\nTwitter: ${twitterUrl}\n\nSearch excerpts:\n${excerpts}`,
      temperature: 0.1,
      maxTokens: 650,
      responseFormat: 'json_object',
    });
    parsed = parseJson(raw);
  } catch {
    parsed = null;
  }

  const skills = Array.isArray(parsed?.skills)
    ? parsed.skills.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 8)
    : [];

  const profile: EnrichedProfileDraft = {
    headline: typeof parsed?.headline === 'string' ? parsed.headline : null,
    bio: typeof parsed?.bio === 'string' ? parsed.bio : null,
    rolePreference: skills,
    links: { twitter: twitterUrl },
  };

  return {
    source: 'twitter',
    profile,
    projects: [],
    meta: {
      handle: handle || null,
      resultCount: results.length,
      signals: Array.isArray(parsed?.signals) ? parsed.signals.slice(0, 4) : [],
      citations: results.map((r) => r.url).slice(0, 4),
    },
  };
}
