import { normalizeUrl } from './urlToMarkdown';

/** urltomarkdown.herokuapp.com and Jina Reader can fail when the target URL ends with `/`. */
export function urlForMarkdownFetch(input: string): string | null {
  const normalized = normalizeUrl(input);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return parsed.toString();
  } catch {
    return normalized.replace(/\/+$/, '');
  }
}
