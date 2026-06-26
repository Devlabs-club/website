import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type ExaResult = {
  title: string | null;
  url: string;
  author?: string | null;
  highlights: string[];
};

export function hasExaConfig(runtime?: RuntimeEnv) {
  return Boolean(readEnv('EXA_API_KEY', runtime));
}

/**
 * Minimal Exa `/search` wrapper, tuned to be CHEAP:
 *  - `type: 'auto'` (~1s, balanced) — never `deep`/`deep-reasoning`.
 *  - `contents.highlights` only (token-efficient excerpts), never full `text`.
 *  - small `numResults`.
 * One call gets us "enough to know the person" without burning credits.
 */
export async function exaSearch(
  query: string,
  opts: { numResults?: number; includeDomains?: string[]; category?: 'people' | 'company' } = {},
  runtime?: RuntimeEnv
): Promise<ExaResult[]> {
  const apiKey = readEnv('EXA_API_KEY', runtime);
  if (!apiKey) return [];

  const body: Record<string, unknown> = {
    query,
    type: 'auto',
    numResults: Math.min(opts.numResults ?? 5, 8),
    contents: { highlights: true },
  };
  if (opts.includeDomains?.length) body.includeDomains = opts.includeDomains;
  if (opts.category) body.category = opts.category;

  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn(`[exa] search failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    if (res.status === 401 || res.status === 403) {
      console.warn('[exa] 401/403 means the EXA_API_KEY the server loaded is wrong/empty. Restart the dev server and ensure no stale EXA_API_KEY in your shell or .dev.vars overrides .env (dotenv uses override:false).');
    }
    return [];
  }
  const data = (await res.json()) as any;
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((r: any) => ({
    title: r.title || null,
    url: r.url,
    author: r.author || null,
    highlights: Array.isArray(r.highlights) ? r.highlights.slice(0, 3) : [],
  }));
}
