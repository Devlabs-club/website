import { hrefForProfileField, type SanitizedBuilderLinks } from '@/lib/talent/externalProfileHref';

export type LinkReachability = {
  reachable: boolean;
  /** DNS NXDOMAIN / HTTP 404/410 — safe to delete from the profile. */
  confident: boolean;
  reason: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'status' | 'url'>>;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const UNREACHABLE_TTL_MS = 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 4000;

const SKIP_PROBE_HOSTS = new Set(['linkedin.com']);

const cache = new Map<string, { result: LinkReachability; expiresAt: number }>();

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function shouldSkipProbe(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return true;
  return [...SKIP_PROBE_HOSTS].some((expected) => host === expected || host.endsWith(`.${expected}`));
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const record = error as { cause?: { code?: string }; code?: string; message?: string };
  return String(record.cause?.code || record.code || '');
}

function isUnreachableNetwork(error: unknown): boolean {
  const code = errorCode(error).toUpperCase();
  const message = error instanceof Error ? `${error.message} ${errorCode(error)} ${String((error as { cause?: unknown }).cause || '')}` : String(error);
  return (
    ['ENOTFOUND', 'ENODATA', 'ERR_NAME_NOT_RESOLVED', 'EAI_NONAME', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code) ||
    /ENOTFOUND|ERR_NAME_NOT_RESOLVED|getaddrinfo|Name not resolved|ConnectionRefused|FailedToOpenSocket|typo in the url or port|Unable to connect/i.test(message)
  );
}

function isTimeout(error: unknown): boolean {
  if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'TimeoutError') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|aborted|AbortError/i.test(message);
}

export function isHttpStatusReachable(status: number): boolean {
  if (status === 404 || status === 410) return false;
  if (status === 999) return true;
  if (status >= 200 && status < 500) return true;
  if (status >= 500) return true;
  return false;
}

export function isHttpStatusConfidentUnreachable(status: number): boolean {
  return status === 404 || status === 410;
}

async function request(url: string, method: 'HEAD' | 'GET', fetchImpl: FetchLike) {
  return fetchImpl(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    },
  });
}

export async function probeLinkReachability(
  url: string,
  options?: { fetch?: FetchLike }
): Promise<LinkReachability> {
  const fetchImpl = options?.fetch || fetch;
  if (!options?.fetch) {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
  }

  let result: LinkReachability;
  if (shouldSkipProbe(url)) {
    result = { reachable: true, confident: true, reason: 'skip_probe' };
  } else {
    try {
      let response = await request(url, 'HEAD', fetchImpl);
      if (response.status === 405 || response.status === 501) {
        response = await request(url, 'GET', fetchImpl);
      }
      if (isHttpStatusConfidentUnreachable(response.status)) {
        result = { reachable: false, confident: true, reason: `http_${response.status}` };
      } else if (isHttpStatusReachable(response.status)) {
        result = { reachable: true, confident: true, reason: `http_${response.status}` };
      } else {
        result = { reachable: false, confident: false, reason: `http_${response.status}` };
      }
    } catch (error) {
      if (isUnreachableNetwork(error)) {
        result = { reachable: false, confident: true, reason: errorCode(error) || 'dns_not_found' };
      } else if (isTimeout(error)) {
        result = { reachable: false, confident: false, reason: 'timeout' };
      } else {
        result = { reachable: false, confident: false, reason: errorCode(error) || 'fetch_failed' };
      }
    }
  }

  if (!options?.fetch) {
    cache.set(url, {
      result,
      expiresAt: Date.now() + (result.reachable ? CACHE_TTL_MS : UNREACHABLE_TTL_MS),
    });
  }
  return result;
}

const PROBED_FIELDS: Array<keyof SanitizedBuilderLinks> = [
  'github',
  'portfolio',
  'personalWebsite',
  'devpost',
  'twitter',
];

export async function filterReachableBuilderLinks(
  links: SanitizedBuilderLinks,
  options?: { fetch?: FetchLike }
): Promise<{ links: SanitizedBuilderLinks; clearKeys: Array<keyof SanitizedBuilderLinks> }> {
  const next = { ...links };
  const clearKeys: Array<keyof SanitizedBuilderLinks> = [];
  await Promise.all(
    PROBED_FIELDS.map(async (key) => {
      const href = next[key];
      if (!href) return;
      const probed = await probeLinkReachability(href, options);
      if (probed.reachable) return;
      next[key] = null;
      if (probed.confident) clearKeys.push(key);
    })
  );
  return { links: next, clearKeys };
}

export async function reachableHrefForField(
  key: string,
  value: unknown,
  options?: { fetch?: FetchLike }
): Promise<string | null> {
  const href = hrefForProfileField(key, value);
  if (!href) return null;
  if (key === 'linkedin' || key === 'resume') return href;
  const probed = await probeLinkReachability(href, options);
  return probed.reachable ? href : null;
}

export async function persistClearedBuilderLinks(
  builderId: unknown,
  clearKeys: Array<keyof SanitizedBuilderLinks>
): Promise<void> {
  const id = String(builderId || '').trim();
  if (!id || !clearKeys.length) return;
  const { default: BuilderProfile } = await import('@/models/talent/BuilderProfile');
  const $set = Object.fromEntries(clearKeys.map((key) => [`links.${key}`, null]));
  await BuilderProfile.updateOne({ _id: id }, { $set });
}

export async function sanitizeStoredBuilderLinksForDisplay(
  rawLinks: unknown,
  options?: { builderId?: unknown; fetch?: FetchLike; persist?: boolean }
): Promise<SanitizedBuilderLinks> {
  const { sanitizeBuilderProfileLinks } = await import('@/lib/talent/externalProfileHref');
  const formatted = sanitizeBuilderProfileLinks(rawLinks);
  const { links, clearKeys } = await filterReachableBuilderLinks(formatted, { fetch: options?.fetch });
  if (options?.persist !== false && options?.builderId && clearKeys.length) {
    void persistClearedBuilderLinks(options.builderId, clearKeys).catch((error) => {
      console.warn('[linkReachability] failed to clear dead links', error);
    });
  }
  return links;
}

export async function sweepUnreachableBuilderLinks(options?: { limit?: number }) {
  const { default: BuilderProfile } = await import('@/models/talent/BuilderProfile');
  const { sanitizeBuilderProfileLinks } = await import('@/lib/talent/externalProfileHref');
  const query = BuilderProfile.find({
    $or: [
      { 'links.github': { $exists: true, $nin: [null, ''] } },
      { 'links.portfolio': { $exists: true, $nin: [null, ''] } },
      { 'links.personalWebsite': { $exists: true, $nin: [null, ''] } },
    ],
  }).select('name email links');
  if (options?.limit) query.limit(options.limit);
  const docs = await query.lean();

  type Owner = { id: string; name: string; key: keyof SanitizedBuilderLinks };
  const ownersByUrl = new Map<string, Owner[]>();
  for (const doc of docs) {
    const formatted = sanitizeBuilderProfileLinks((doc as { links?: unknown }).links);
    for (const key of ['github', 'portfolio', 'personalWebsite'] as const) {
      const href = formatted[key];
      if (!href) continue;
      const owners = ownersByUrl.get(href) || [];
      owners.push({ id: String((doc as { _id: unknown })._id), name: String((doc as { name?: string }).name || ''), key });
      ownersByUrl.set(href, owners);
    }
  }

  const cleared: Array<{ name: string; key: string; url: string; reason: string }> = [];
  const urls = [...ownersByUrl.keys()];
  const concurrency = 10;
  for (let index = 0; index < urls.length; index += concurrency) {
    const batch = urls.slice(index, index + concurrency);
    await Promise.all(
      batch.map(async (url) => {
        const probed = await probeLinkReachability(url);
        if (!probed.confident || probed.reachable) return;
        const owners = ownersByUrl.get(url) || [];
        const byBuilder = new Map<string, Array<keyof SanitizedBuilderLinks>>();
        for (const owner of owners) {
          const keys = byBuilder.get(owner.id) || [];
          keys.push(owner.key);
          byBuilder.set(owner.id, keys);
          cleared.push({ name: owner.name, key: owner.key, url, reason: probed.reason });
        }
        await Promise.all(
          [...byBuilder.entries()].map(([id, keys]) => persistClearedBuilderLinks(id, [...new Set(keys)]))
        );
      })
    );
  }

  return { builderCount: docs.length, uniqueUrls: urls.length, clearedCount: cleared.length, cleared: cleared.slice(0, 40) };
}
