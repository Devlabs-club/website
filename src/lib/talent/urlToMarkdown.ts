/**
 * Fetch readable page content as markdown via Jina Reader (r.jina.ai).
 * Used after Exa returns candidate URLs — Exa gives links + snippets; we pull
 * full page text for dossier synthesis.
 */
export async function urlToMarkdown(url: string, maxChars = 12000): Promise<string> {
  const target = String(url || '').trim();
  if (!target.startsWith('http')) return '';

  try {
    const res = await fetch(`https://r.jina.ai/${target}`, {
      signal: AbortSignal.timeout(25000),
      headers: {
        Accept: 'text/markdown',
        'X-Return-Format': 'markdown',
      },
    });
    if (!res.ok) return '';
    const text = await res.text();
    return text.slice(0, maxChars);
  } catch (err) {
    console.warn('[urlToMarkdown] failed', target, err);
    return '';
  }
}

/** Pull markdown for several URLs in parallel (best-effort, capped). */
export async function urlsToMarkdown(urls: string[], perUrlLimit = 8000): Promise<Array<{ url: string; markdown: string }>> {
  const unique = [...new Set(urls.filter((u) => u.startsWith('http')))].slice(0, 6);
  const results = await Promise.all(
    unique.map(async (url) => ({ url, markdown: await urlToMarkdown(url, perUrlLimit) }))
  );
  return results.filter((r) => r.markdown.length > 80);
}
