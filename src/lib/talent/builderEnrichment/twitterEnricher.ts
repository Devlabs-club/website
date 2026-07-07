import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import { exaSearch, hasExaConfig } from '@/lib/talent/exaClient';
import {
  fetchTopTwitterPosts,
  hasTwitterApiConfig,
  parseTwitterHandle,
} from '@/lib/talent/twitterApiClient';
import type { RuntimeEnv } from '@/lib/workosEnv';
import type { EnrichedProfileDraft, SourceEnrichmentResult } from './types';

function parseJson(raw: string) {
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    return null;
  }
}

function formatPostsForLlm(posts: Array<{ text: string; url: string; likeCount: number; urls: string[] }>) {
  return posts
    .map((p, i) => {
      const links = p.urls.length ? `\nLinks: ${p.urls.join(', ')}` : '';
      return `[${i + 1}] (${p.likeCount} likes) ${p.url}\n${p.text}${links}`;
    })
    .join('\n\n')
    .slice(0, 6000);
}

async function enrichFromTwitterExa(builder: any, twitterUrl: string, handle: string): Promise<SourceEnrichmentResult | null> {
  if (!hasExaConfig()) return null;

  const query = [
    builder?.name,
    handle ? `@${handle}` : twitterUrl,
    'X Twitter builder projects launches shipped work',
  ]
    .filter(Boolean)
    .join(' ');

  let results = [];
  try {
    results = await exaSearch(query, { numResults: 6 });
  } catch {
    return null;
  }
  if (!results.length) return null;

  const excerpts = results
    .map((r, i) => `[${i + 1}] ${r.title || r.url}\nURL: ${r.url}\n${r.highlights.join(' ... ')}`)
    .join('\n\n')
    .slice(0, 5000);

  if (!hasOpenRouterConfig()) {
    return {
      source: 'twitter',
      profile: { links: { twitter: twitterUrl } },
      errors: ['openrouter_not_configured'],
      meta: { handle: handle || null, via: 'exa_fallback', citations: results.map((r) => r.url) },
    };
  }

  const raw = await generateOpenRouterReply({
    systemPrompt: `You extract useful builder-profile signal from X/Twitter search excerpts.
Only use facts that clearly match this builder. Ignore namesakes and vague hype.
Return STRICT JSON:
{
  "headline": string|null,
  "bio": string|null,
  "skills": string[],
  "signals": string[]
}`,
    userPrompt: `Builder: ${builder?.name || 'unknown'}\nTwitter: ${twitterUrl}\n\nSearch excerpts:\n${excerpts}`,
    temperature: 0.1,
    maxTokens: 650,
    responseFormat: 'json_object',
  });
  const parsed = parseJson(raw);
  const skills = Array.isArray(parsed?.skills)
    ? parsed.skills.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    source: 'twitter',
    profile: {
      headline: typeof parsed?.headline === 'string' ? parsed.headline : null,
      bio: typeof parsed?.bio === 'string' ? parsed.bio : null,
      rolePreference: skills,
      links: { twitter: twitterUrl },
    },
    meta: {
      handle: handle || null,
      via: 'exa_fallback',
      resultCount: results.length,
      signals: Array.isArray(parsed?.signals) ? parsed.signals.slice(0, 4) : [],
      citations: results.map((r) => r.url).slice(0, 4),
    },
  };
}

export async function enrichFromTwitter(
  builder: any,
  ctx?: { runtime?: RuntimeEnv }
): Promise<SourceEnrichmentResult> {
  const twitterUrl = builder?.links?.twitter;
  if (!twitterUrl) return { source: 'twitter', errors: ['no_twitter_url'] };

  const handle = parseTwitterHandle(twitterUrl);
  const runtime = ctx?.runtime;

  if (hasTwitterApiConfig(runtime)) {
    const { user, posts, errors: apiErrors } = await fetchTopTwitterPosts(handle || twitterUrl, {
      limit: 6,
      runtime,
    });

    if (user && posts.length) {
      if (!hasOpenRouterConfig()) {
        return {
          source: 'twitter',
          profile: {
            headline: user.description?.slice(0, 120) || null,
            bio: user.description || null,
            links: { twitter: twitterUrl },
          },
          meta: {
            handle: user.username,
            via: 'twitter_api',
            topPosts: posts.map((p) => ({
              url: p.url,
              text: p.text,
              likes: p.likeCount,
              score: p.score,
              links: p.urls,
            })),
            followersCount: user.followersCount,
          },
          errors: ['openrouter_not_configured'],
        };
      }

      const postText = formatPostsForLlm(posts);
      let parsed: any = null;
      try {
        const raw = await generateOpenRouterReply({
          systemPrompt: `You extract founder-grade builder signal from a builder's REAL X/Twitter posts (not search snippets).
Only use facts clearly written by this person. Ignore engagement bait with no substance.
Do NOT invent projects — we only want profile voice and proof signals, not project cards.
Return STRICT JSON:
{
  "headline": string|null,
  "bio": string|null,
  "skills": string[],
  "signals": string[]
}
signals = 2-5 short proof-of-work facts (launches, OSS, hackathons, products, communities, technical interests).`,
          userPrompt: `Builder: ${builder?.name || user.name}\nTwitter: @${user.username}\nBio: ${user.description || '(none)'}\n\nTop posts:\n${postText}`,
          temperature: 0.1,
          maxTokens: 900,
          responseFormat: 'json_object',
        });
        parsed = parseJson(raw);
      } catch {
        parsed = null;
      }

      const skills = Array.isArray(parsed?.skills)
        ? parsed.skills.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 10)
        : [];

      const profile: EnrichedProfileDraft = {
        headline: typeof parsed?.headline === 'string' ? parsed.headline : user.description?.slice(0, 120) || null,
        bio: typeof parsed?.bio === 'string' ? parsed.bio : user.description || null,
        rolePreference: skills,
        links: { twitter: twitterUrl },
      };

      return {
        source: 'twitter',
        profile,
        meta: {
          handle: user.username,
          via: 'twitter_api',
          followersCount: user.followersCount,
          topPosts: posts.map((p) => ({
            url: p.url,
            text: p.text.slice(0, 280),
            likes: p.likeCount,
            retweets: p.retweetCount,
            score: p.score,
            links: p.urls,
          })),
          signals: Array.isArray(parsed?.signals) ? parsed.signals.slice(0, 5) : [],
        },
      };
    }

    if (apiErrors.length && !hasExaConfig()) {
      return { source: 'twitter', errors: apiErrors, profile: { links: { twitter: twitterUrl } } };
    }
  }

  const exaFallback = await enrichFromTwitterExa(builder, twitterUrl, handle);
  if (exaFallback) return exaFallback;

  if (!hasTwitterApiConfig(runtime) && !hasExaConfig()) {
    return { source: 'twitter', errors: ['twitter_api_not_configured', 'exa_not_configured'] };
  }

  return {
    source: 'twitter',
    profile: { links: { twitter: twitterUrl } },
    errors: ['no_twitter_results'],
  };
}
