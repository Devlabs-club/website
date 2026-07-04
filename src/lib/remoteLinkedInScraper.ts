import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export const DEFAULT_LINKEDIN_SCRAPER_URL = 'https://enrich-scraper-production.up.railway.app';

export type RemoteLinkedInScraperResult = {
  summary: any;
  artifact: any;
  remote: true;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

/** Some env files typo the Railway host as rich-scraper instead of enrich-scraper. */
function resolveScraperUrl(runtime?: RuntimeEnv) {
  const configured = readEnv('LINKEDIN_SCRAPER_URL', runtime);
  if (!configured) return DEFAULT_LINKEDIN_SCRAPER_URL;
  const normalized = normalizeBaseUrl(configured);
  if (normalized.includes('rich-scraper-production.up.railway.app')) {
    console.warn(
      '[linkedin-scraper] LINKEDIN_SCRAPER_URL points at rich-scraper-production; using enrich-scraper-production instead.'
    );
    return DEFAULT_LINKEDIN_SCRAPER_URL;
  }
  return normalized;
}

export function getRemoteLinkedInScraperConfig(runtime?: RuntimeEnv) {
  const url = resolveScraperUrl(runtime);
  const secret = readEnv('LINKEDIN_SCRAPER_SECRET', runtime);
  if (!url || !secret) return null;
  return { url: normalizeBaseUrl(url), secret };
}

export function requireRemoteLinkedInScraperConfig(runtime?: RuntimeEnv) {
  const config = getRemoteLinkedInScraperConfig(runtime);
  if (!config) {
    throw new Error('LINKEDIN_SCRAPER_SECRET is not configured for the Railway LinkedIn scraper.');
  }
  return config;
}

export async function runRemoteLinkedInScraperScript(
  script: string,
  args: string[],
  runtime?: RuntimeEnv,
  timeoutMs = 120_000
): Promise<RemoteLinkedInScraperResult | null> {
  const config = getRemoteLinkedInScraperConfig(runtime);
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.url}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify({ script, args }),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : typeof payload?.error === 'string'
            ? payload.error
            : `LinkedIn scraper request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    return { summary: payload?.summary, artifact: payload?.artifact, remote: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runRequiredRemoteLinkedInScraperScript(
  script: string,
  args: string[],
  runtime?: RuntimeEnv,
  timeoutMs = 120_000
): Promise<RemoteLinkedInScraperResult> {
  requireRemoteLinkedInScraperConfig(runtime);
  const result = await runRemoteLinkedInScraperScript(script, args, runtime, timeoutMs);
  if (!result) {
    throw new Error('Railway LinkedIn scraper is not configured.');
  }
  return result;
}
