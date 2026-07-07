import { fetchUrlMarkdown, normalizeUrl } from './urlToMarkdown';

export type CrawledPage = {
  url: string;
  depth: number;
  markdown: string;
};

const SKIP_HOST_SUFFIXES = [
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'google.com',
  'gstatic.com',
  'googleapis.com',
  'cloudflare.com',
  'cloudinary.com',
  'fonts.googleapis.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cloudfront.net',
  'akamaized.net',
  'fastly.net',
  'imgix.net',
  'bunnycdn.com',
  'wp.com',
  'gravatar.com',
];

/** Path/host patterns for static assets and media — always skip, including off-portfolio CDNs. */
const MEDIA_PATH_RE =
  /\/(?:images?|img|media|assets|static|uploads|files|wp-content\/uploads|cdn)\//i;
const CDN_HOST_RE =
  /^(?:cdn|static|assets|media|images?|img|uploads|files)\./i;

const SKIP_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|pdf|zip|rar|7z|tar|gz|mp4|webm|mov|avi|mp3|wav|ogg|m4a|woff2?|ttf|eot|css|js|map|json)(\?|$)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function shouldSkipUrl(url: string, baseHost: string, sameHostOnly: boolean): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return true;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return true;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return true;
  if (SKIP_EXTENSIONS.test(parsed.pathname)) return true;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (SKIP_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return true;
  if (CDN_HOST_RE.test(host)) return true;
  if (MEDIA_PATH_RE.test(parsed.pathname)) return true;
  if (sameHostOnly && host !== baseHost) return true;

  return false;
}

/** Pull markdown links + bare URLs from converted page text. */
export function extractLinksFromMarkdown(markdown: string, baseUrl: string): string[] {
  if (!markdown) return [];

  const found = new Set<string>();
  const baseHost = hostOf(baseUrl);

  const add = (raw: string) => {
    const cleaned = raw.trim().replace(/[),.;:!?]+$/g, '');
    if (!cleaned || cleaned.startsWith('#') || cleaned.startsWith('mailto:') || cleaned.startsWith('tel:')) return;

    let absolute = cleaned;
    if (cleaned.startsWith('/')) {
      try {
        absolute = new URL(cleaned, baseUrl).toString();
      } catch {
        return;
      }
    } else if (!/^https?:\/\//i.test(cleaned)) {
      return;
    }

    const normalized = normalizeUrl(absolute);
    if (!normalized || shouldSkipUrl(normalized, baseHost, false)) return;
    found.add(normalized);
  };

  for (const match of markdown.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    add(match[2]);
  }
  for (const match of markdown.matchAll(/\bhttps?:\/\/[^\s)\]>]+/gi)) {
    add(match[0]);
  }

  return [...found];
}

function prioritizeLinks(urls: string[], rootHost: string): string[] {
  return [...urls].sort((a, b) => {
    const aHost = hostOf(a);
    const bHost = hostOf(b);
    const aSame = aHost === rootHost ? 1 : 0;
    const bSame = bHost === rootHost ? 1 : 0;
    if (aSame !== bSame) return bSame - aSame;

    const aProject = /github\.com|devpost\.com|\.dev|portfolio|project/i.test(a) ? 1 : 0;
    const bProject = /github\.com|devpost\.com|\.dev|portfolio|project/i.test(b) ? 1 : 0;
    return bProject - aProject;
  });
}

/**
 * Fetch a page as markdown, then follow interesting outbound links up to `maxDepth`
 * (0 = root only, 2 = root → child → grandchild).
 */
export async function crawlMarkdownFromUrl(
  rootUrl: string,
  opts?: {
    maxDepth?: number;
    maxPages?: number;
    maxCharsPerPage?: number;
    /** When true, only follow links on the same hostname as the root URL. */
    sameHostOnly?: boolean;
  }
): Promise<{ pages: CrawledPage[]; combinedMarkdown: string }> {
  const normalizedRoot = normalizeUrl(rootUrl);
  if (!normalizedRoot) return { pages: [], combinedMarkdown: '' };

  const maxDepth = Math.min(Math.max(opts?.maxDepth ?? 2, 0), 2);
  const maxPages = Math.min(Math.max(opts?.maxPages ?? 8, 1), 12);
  const maxCharsPerPage = opts?.maxCharsPerPage ?? 5000;
  const sameHostOnly = opts?.sameHostOnly ?? false;
  const rootHost = hostOf(normalizedRoot);

  const pages: CrawledPage[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: normalizedRoot, depth: 0 }];

  while (queue.length && pages.length < maxPages) {
    const next = queue.shift()!;
    if (visited.has(next.url)) continue;
    visited.add(next.url);

    const chunk = await fetchUrlMarkdown(next.url, `depth-${next.depth}`, maxCharsPerPage);
    if (!chunk?.markdown || chunk.markdown.length < 80) continue;

    pages.push({ url: next.url, depth: next.depth, markdown: chunk.markdown });

    if (next.depth >= maxDepth) continue;

    const outbound = extractLinksFromMarkdown(chunk.markdown, next.url).filter((url) => {
      if (visited.has(url)) return false;
      if (sameHostOnly && hostOf(url) !== rootHost) return false;
      return !shouldSkipUrl(url, rootHost, sameHostOnly);
    });

    for (const url of prioritizeLinks(outbound, rootHost).slice(0, 6)) {
      if (!visited.has(url)) queue.push({ url, depth: next.depth + 1 });
    }
  }

  const combinedMarkdown = pages
    .map((p) => `## [depth ${p.depth}] ${p.url}\n\n${p.markdown}`)
    .join('\n\n---\n\n')
    .slice(0, maxCharsPerPage * Math.min(pages.length, 4));

  return { pages, combinedMarkdown };
}
