import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type TwitterUser = {
  id: string;
  username: string;
  name: string;
  description: string;
  url: string | null;
  profileImageUrl: string | null;
  followersCount: number;
  tweetCount: number;
};

export type TwitterPost = {
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  urls: string[];
  score: number;
};

export function hasTwitterApiConfig(runtime?: RuntimeEnv): boolean {
  return Boolean(readEnv('TWITTER_BEARER_TOKEN', runtime) || readEnv('TWITTER_API_KEY', runtime));
}

export function parseTwitterHandle(input: string): string {
  const trimmed = String(input || '').trim().replace(/^@/, '');
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (!['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(parsed.hostname.toLowerCase())) {
        return '';
      }
      const segment = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (!segment || ['home', 'search', 'i', 'intent', 'share'].includes(segment.toLowerCase())) return '';
      return segment.replace(/^@/, '');
    } catch {
      return '';
    }
  }

  return trimmed.split('/')[0]?.replace(/^@/, '') || '';
}

function bearerToken(runtime?: RuntimeEnv): string | undefined {
  const raw = readEnv('TWITTER_BEARER_TOKEN', runtime);
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function twitterGet<T>(path: string, runtime?: RuntimeEnv): Promise<T | null> {
  const token = bearerToken(runtime);
  if (!token) return null;

  try {
    const res = await fetch(`https://api.twitter.com/2${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`[twitterApi] ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn('[twitterApi] request failed', path, err);
    return null;
  }
}

function scoreTweet(text: string, metrics: Record<string, number>, urls: string[]): number {
  const engagement =
    (metrics.like_count || 0) * 2 +
    (metrics.retweet_count || 0) * 3 +
    (metrics.quote_count || 0) * 2 +
    (metrics.reply_count || 0) * 0.5 +
    (metrics.impression_count || 0) * 0.001;

  const projectSignal = /\b(launch|shipped|built|release|demo|github|open.?source|hackathon|project|mvp|beta|startup|product)\b/i.test(
    text
  );
  const hasLink = urls.length > 0;
  const longForm = text.length > 120;

  return engagement + (projectSignal ? 18 : 0) + (hasLink ? 12 : 0) + (longForm ? 4 : 0);
}

export async function fetchTwitterUserByUsername(
  username: string,
  runtime?: RuntimeEnv
): Promise<TwitterUser | null> {
  const handle = parseTwitterHandle(username);
  if (!handle) return null;

  const data = await twitterGet<{
    data?: {
      id: string;
      username: string;
      name: string;
      description?: string;
      url?: string;
      profile_image_url?: string;
      public_metrics?: Record<string, number>;
    };
  }>(
    `/users/by/username/${encodeURIComponent(handle)}?user.fields=description,url,profile_image_url,public_metrics`,
    runtime
  );

  const user = data?.data;
  if (!user?.id) return null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    description: user.description || '',
    url: user.url || null,
    profileImageUrl: user.profile_image_url || null,
    followersCount: user.public_metrics?.followers_count || 0,
    tweetCount: user.public_metrics?.tweet_count || 0,
  };
}

export async function fetchTopTwitterPosts(
  username: string,
  opts?: { limit?: number; runtime?: RuntimeEnv }
): Promise<{ user: TwitterUser | null; posts: TwitterPost[]; errors: string[] }> {
  const errors: string[] = [];
  if (!hasTwitterApiConfig(opts?.runtime)) {
    return { user: null, posts: [], errors: ['twitter_api_not_configured'] };
  }

  const user = await fetchTwitterUserByUsername(username, opts?.runtime);
  if (!user) {
    return { user: null, posts: [], errors: ['twitter_user_lookup_failed'] };
  }

  const limit = Math.min(Math.max(opts?.limit ?? 6, 3), 10);
  const data = await twitterGet<{
    data?: Array<{
      id: string;
      text: string;
      created_at?: string;
      public_metrics?: Record<string, number>;
      entities?: { urls?: Array<{ expanded_url?: string; url?: string }> };
    }>;
  }>(
    `/users/${user.id}/tweets?max_results=${Math.min(limit * 3, 25)}&tweet.fields=created_at,public_metrics,entities,lang&exclude=replies,retweets`,
    opts?.runtime
  );

  const tweets = data?.data || [];
  if (!tweets.length) {
    return { user, posts: [], errors: ['no_tweets_found'] };
  }

  const posts: TwitterPost[] = tweets.map((tweet) => {
    const urls = (tweet.entities?.urls || [])
      .map((u) => u.expanded_url || u.url)
      .filter((u): u is string => Boolean(u));
    const metrics = tweet.public_metrics || {};
    const text = tweet.text || '';
    return {
      id: tweet.id,
      text,
      createdAt: tweet.created_at || null,
      url: `https://x.com/${user.username}/status/${tweet.id}`,
      likeCount: metrics.like_count || 0,
      retweetCount: metrics.retweet_count || 0,
      replyCount: metrics.reply_count || 0,
      quoteCount: metrics.quote_count || 0,
      impressionCount: metrics.impression_count || 0,
      urls,
      score: scoreTweet(text, metrics, urls),
    };
  });

  posts.sort((a, b) => b.score - a.score);
  return { user, posts: posts.slice(0, limit), errors };
}
