import { urlForMarkdownFetch } from './urlForMarkdown';

export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || /^n\/a$/i.test(trimmed)) return null;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  return hasScheme ? trimmed : `https://${trimmed}`;
}

function isUsableMarkdown(text: string, minChars = 80): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length >= minChars &&
    !/could not fetch and convert/i.test(trimmed) &&
    !/status code 999/i.test(trimmed) &&
    !/^error:/i.test(trimmed)
  );
}

function buildHerokuMarkdownUrl(url: string) {
  const fetchUrl = urlForMarkdownFetch(url) || url;
  const params = new URLSearchParams({
    url: fetchUrl,
    title: 'true',
    links: 'true',
    clean: 'true',
  });
  return `https://urltomarkdown.herokuapp.com/?${params.toString()}`;
}

/** Jina Reader — free markdown proxy, generally more reliable than Heroku urltomarkdown. */
async function fetchViaJina(url: string, maxChars: number): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(28000),
      headers: {
        Accept: 'text/markdown',
        'X-Return-Format': 'markdown',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!isUsableMarkdown(text)) return null;
    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}

/** Legacy Heroku converter — kept as fallback when Jina fails. */
async function fetchViaHeroku(url: string, maxChars: number): Promise<string | null> {
  try {
    const res = await fetch(buildHerokuMarkdownUrl(url), {
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!isUsableMarkdown(text)) return null;
    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}

/** Direct HTML fetch → plain text when markdown services fail. */
async function fetchViaDirectHtml(url: string, maxChars: number): Promise<string | null> {
  const text = await fetchAuthenticatedPageText(url, { maxChars });
  return text && text.length >= 80 ? text : null;
}

export type PageMarkdownResult = {
  source: string;
  label: string;
  markdown: string;
  provider: 'jina' | 'heroku' | 'direct_html';
};

/**
 * Fetch a public page as markdown/plain text.
 * Tries Jina Reader → Heroku urltomarkdown → direct HTML (in order).
 */
export async function fetchUrlMarkdown(
  url: string,
  label: string,
  maxChars = 6000
): Promise<PageMarkdownResult | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const markdownUrl = urlForMarkdownFetch(normalized) || normalized;

  const attempts: Array<{ provider: PageMarkdownResult['provider']; fetch: () => Promise<string | null> }> = [
    { provider: 'jina', fetch: () => fetchViaJina(markdownUrl, maxChars) },
    { provider: 'heroku', fetch: () => fetchViaHeroku(markdownUrl, maxChars) },
    { provider: 'direct_html', fetch: () => fetchViaDirectHtml(markdownUrl, maxChars) },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const markdown = await attempt.fetch();
      if (markdown) {
        return { source: markdownUrl, label, markdown, provider: attempt.provider };
      }
      errors.push(`${attempt.provider}:empty`);
    } catch (err) {
      errors.push(`${attempt.provider}:${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  console.warn('[builderEnrichment] page markdown fetch failed', {
    label,
    url: markdownUrl,
    errors,
  });
  return null;
}

/** Strip HTML to plain text for authenticated fetches (e.g. LinkedIn with session cookie). */
export function htmlToPlainText(html: string, maxChars = 8000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

export async function fetchAuthenticatedPageText(
  url: string,
  options?: { cookieHeader?: string; maxChars?: number }
): Promise<string | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    if (options?.cookieHeader) {
      headers.Cookie = options.cookieHeader;
    }

    const response = await fetch(normalized, {
      headers,
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (!html.trim()) return null;
    return htmlToPlainText(html, options?.maxChars ?? 8000);
  } catch (err) {
    console.warn('[builderEnrichment] authenticated fetch failed', {
      url: normalized,
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
}
