import { normalizeUrl } from './urlToMarkdown';

/** urltomarkdown.herokuapp.com fails when the target URL ends with `/` (e.g. LinkedIn profiles). */
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
