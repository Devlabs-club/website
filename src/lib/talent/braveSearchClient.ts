import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type BraveSearchResult = {
  title: string | null;
  url: string;
  description: string;
  age?: string | null;
};

export function hasBraveSearchConfig(runtime?: RuntimeEnv): boolean {
  return Boolean(readEnv('BRAVE_SEARCH_API_KEY', runtime));
}

/**
 * Brave Web Search — used to discover a builder's public links and social presence.
 * @see https://api.search.brave.com/app/documentation/web-search/get-started
 */
export async function braveWebSearch(
  query: string,
  opts?: { count?: number; runtime?: RuntimeEnv }
): Promise<BraveSearchResult[]> {
  const apiKey = readEnv('BRAVE_SEARCH_API_KEY', opts?.runtime);
  if (!apiKey) return [];

  const count = Math.min(Math.max(opts?.count ?? 8, 1), 20);
  const params = new URLSearchParams({
    q: query,
    count: String(count),
    text_decorations: 'false',
    search_lang: 'en',
  });

  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`[braveSearch] failed (${res.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
      return [];
    }

    const data = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> };
    };

    return (data.web?.results || [])
      .filter((r) => r.url?.startsWith('http'))
      .map((r) => ({
        title: r.title || null,
        url: r.url!,
        description: r.description || '',
        age: r.age || null,
      }));
  } catch (err) {
    console.warn('[braveSearch] request failed', err);
    return [];
  }
}

/** Build a tight identity-anchored query for discovering social + project links. */
export function buildBuilderPresenceQuery(builder: {
  name?: string | null;
  universityOrCompany?: string | null;
  location?: string | null;
  links?: Record<string, string | null | undefined>;
}): string {
  const parts = [builder.name, builder.universityOrCompany || builder.location].filter(Boolean);
  const handle =
    (builder.links?.github || builder.links?.linkedin || '')
      .split('/')
      .filter(Boolean)
      .pop() || '';
  const anchor = parts.join(' ');
  return `${anchor}${handle ? ` ${handle}` : ''} developer portfolio github devpost twitter personal website projects`;
}

/** Search Brave and return deduped URLs worth scraping. */
export async function braveDiscoverBuilderUrls(
  builder: Parameters<typeof buildBuilderPresenceQuery>[0],
  opts?: { count?: number; runtime?: RuntimeEnv }
): Promise<{ results: BraveSearchResult[]; urls: string[] }> {
  const query = buildBuilderPresenceQuery(builder);
  const results = await braveWebSearch(query, opts);
  const urls = [...new Set(results.map((r) => r.url))].slice(0, opts?.count ?? 8);
  return { results, urls };
}
