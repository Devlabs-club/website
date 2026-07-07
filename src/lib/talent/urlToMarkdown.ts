import { fetchUrlMarkdown, normalizeUrl } from '@/lib/talent/builderEnrichment/urlToMarkdown';

/**
 * Fetch readable page content as markdown (Jina Reader → Heroku → direct HTML).
 * Used after search returns candidate URLs for dossier synthesis.
 */
export async function urlToMarkdown(url: string, maxChars = 12000): Promise<string> {
  const target = String(url || '').trim();
  if (!target.startsWith('http')) return '';

  const chunk = await fetchUrlMarkdown(target, 'page', maxChars);
  return chunk?.markdown || '';
}

/** Pull markdown for several URLs in parallel (best-effort, capped). */
export async function urlsToMarkdown(urls: string[], perUrlLimit = 8000): Promise<Array<{ url: string; markdown: string }>> {
  const unique = [...new Set(urls.filter((u) => u.startsWith('http')))].slice(0, 6);
  const results = await Promise.all(
    unique.map(async (url) => ({ url, markdown: await urlToMarkdown(url, perUrlLimit) }))
  );
  return results.filter((r) => r.markdown.length > 80);
}

export { normalizeUrl };
