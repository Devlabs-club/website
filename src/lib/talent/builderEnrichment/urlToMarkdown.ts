import { urlForMarkdownFetch } from './urlForMarkdown';

export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || /^n\/a$/i.test(trimmed)) return null;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  return hasScheme ? trimmed : `https://${trimmed}`;
}

function buildUrlToMarkdownUrl(url: string) {
  const fetchUrl = urlForMarkdownFetch(url) || url;
  const params = new URLSearchParams({
    url: fetchUrl,
    title: 'true',
    links: 'true',
    clean: 'true',
  });
  return `https://urltomarkdown.herokuapp.com/?${params.toString()}`;
}

export async function fetchUrlMarkdown(
  url: string,
  label: string,
  maxChars = 6000
): Promise<{ source: string; label: string; markdown: string } | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const markdownUrl = urlForMarkdownFetch(normalized) || normalized;

  try {
    const response = await fetch(buildUrlToMarkdownUrl(normalized), {
      signal: AbortSignal.timeout(20000),
    });
    const markdown = await response.text();
    if (
      !response.ok ||
      !markdown.trim() ||
      markdown.length < 80 ||
      /could not fetch and convert/i.test(markdown) ||
      /status code 999/i.test(markdown)
    ) {
      return null;
    }
    return {
      source: markdownUrl,
      label,
      markdown: markdown.slice(0, maxChars),
    };
  } catch (err) {
    console.warn('[builderEnrichment] urlToMarkdown failed', {
      label,
      url: markdownUrl,
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
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
