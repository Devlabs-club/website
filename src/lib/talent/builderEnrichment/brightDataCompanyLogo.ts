import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

const BRIGHT_ORGANIZATION_DATASET = 'gd_l1vikfnt1wgvvqz95w';

export function hasBrightDataConfig(runtime?: RuntimeEnv) {
  return Boolean(readEnv('BRIGHTDATA_API_KEY', runtime));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLogoUrls(raw: any): string[] {
  const logos = new Set<string>();
  const walk = (value: unknown, key = '') => {
    if (!value) return;
    if (typeof value === 'string') {
      if (/logo|image|picture|avatar/i.test(key) && /^https?:\/\//i.test(value)) logos.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${key}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, childKey);
      }
    }
  };
  walk(raw);
  if (typeof raw?.logo === 'string') logos.add(raw.logo);
  if (Array.isArray(raw?.logos)) {
    for (const logo of raw.logos) {
      if (typeof logo?.url === 'string') logos.add(logo.url);
      if (typeof logo === 'string') logos.add(logo);
    }
  }
  return [...logos].filter((url) => /^https?:\/\//i.test(url));
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`Bright Data HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

/** In-memory cache for this process — avoids re-scraping the same org in one enrichment. */
const logoCache = new Map<string, string | null>();

/**
 * Fetch a company/school logo via Bright Data LinkedIn Organizations dataset.
 * Returns the first logo URL found, or null. Caller should persist to Cloudinary.
 */
export async function fetchBrightDataOrganizationLogo(
  organizationLinkedInUrl: string,
  runtime?: RuntimeEnv,
  options?: { pollMs?: number; maxAttempts?: number }
): Promise<string | null> {
  const url = String(organizationLinkedInUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/([^/]+\.)?linkedin\.com\/(company|school)\//i.test(url)) return null;

  const cacheKey = url.toLowerCase();
  if (logoCache.has(cacheKey)) return logoCache.get(cacheKey) || null;

  const apiKey = readEnv('BRIGHTDATA_API_KEY', runtime);
  if (!apiKey) {
    logoCache.set(cacheKey, null);
    return null;
  }

  try {
    const trigger = await requestJson(
      `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHT_ORGANIZATION_DATASET}&include_errors=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ url }]),
      }
    );
    const snapshotId = trigger?.snapshot_id || trigger?.snapshotId;
    if (!snapshotId) {
      logoCache.set(cacheKey, null);
      return null;
    }

    const pollMs = options?.pollMs ?? 4000;
    const maxAttempts = options?.maxAttempts ?? 30;
    let rows: any[] = [];
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const status = await requestJson(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const state = String(status?.status || status?.state || '').toLowerCase();
      if (state === 'ready' || state === 'done' || state === 'completed') {
        const download = await fetch(
          `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        const body = await download.json();
        rows = Array.isArray(body) ? body : [];
        break;
      }
      if (state === 'failed' || state === 'error') {
        logoCache.set(cacheKey, null);
        return null;
      }
      await sleep(pollMs);
    }

    const logos = rows.flatMap((row) => findLogoUrls(row));
    const first = logos[0] || null;
    logoCache.set(cacheKey, first);
    return first;
  } catch (error) {
    console.warn('[brightdata-org-logo] failed', url, error instanceof Error ? error.message : error);
    logoCache.set(cacheKey, null);
    return null;
  }
}
