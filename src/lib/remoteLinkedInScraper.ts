import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export const DEFAULT_LINKEDIN_SCRAPER_URL = 'https://enrich-scraper-production.up.railway.app';

/** Default remote CDP call budget. Keep below Vercel maxDuration (300s). */
export const DEFAULT_REMOTE_SCRAPER_TIMEOUT_MS = 90_000;
export const FOUNDER_PROFILE_SCRAPER_TIMEOUT_MS = 150_000;
export const FOUNDER_COMPANY_SCRAPER_TIMEOUT_MS = 50_000;

export type RemoteLinkedInScraperResult = {
  summary: any;
  artifact: any;
  remote: true;
};

export type QueuedLinkedInEnrichment = {
  batchId: string;
  statusUrl: string;
  status: 'queued';
  remote: true;
};

let warnedRichScraperTypo = false;

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

/** Some env files typo the Railway host as rich-scraper instead of enrich-scraper. */
function resolveScraperUrl(runtime?: RuntimeEnv) {
  const configured = readEnv('LINKEDIN_SCRAPER_URL', runtime);
  if (!configured) return DEFAULT_LINKEDIN_SCRAPER_URL;
  const normalized = normalizeBaseUrl(configured);
  if (normalized.includes('rich-scraper-production.up.railway.app')) {
    if (!warnedRichScraperTypo) {
      warnedRichScraperTypo = true;
      console.warn(
        '[linkedin-scraper] LINKEDIN_SCRAPER_URL points at rich-scraper-production; using enrich-scraper-production instead.'
      );
    }
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

/**
 * Submit one builder profile to Railway's global FIFO queue. Completion is
 * delivered to our authenticated callback, so request handlers never hold a
 * Chrome session open or trigger fallback LinkedIn requests.
 */
export async function queueRemoteLinkedInBuilderEnrichment(
  builder: { id: string; name: string; linkedInUrl: string },
  runtime?: RuntimeEnv
): Promise<QueuedLinkedInEnrichment | null> {
  return queueRemoteLinkedInProfileEnrichment({ ...builder, callbackType: 'builder' }, runtime);
}

export async function queueRemoteLinkedInFounderEnrichment(
  founder: { id: string; name: string; email: string; linkedInUrl: string },
  runtime?: RuntimeEnv
): Promise<QueuedLinkedInEnrichment | null> {
  return queueRemoteLinkedInProfileEnrichment({ ...founder, callbackType: 'founder' }, runtime);
}

async function queueRemoteLinkedInProfileEnrichment(
  profile: { id: string; name: string; email?: string; linkedInUrl: string; callbackType: 'builder' | 'founder' },
  runtime?: RuntimeEnv
): Promise<QueuedLinkedInEnrichment | null> {
  const config = getRemoteLinkedInScraperConfig(runtime);
  if (!config) return null;
  const batchId = `profile-${String(profile.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(-48)}-${Date.now()}`;
  const response = await fetch(`${config.url}/batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.secret}`,
    },
    body: JSON.stringify({
      batchId,
      builders: [
        {
          builderId: profile.id,
          name: profile.name,
          linkedInUrl: profile.linkedInUrl,
          email: profile.email,
          callback: true,
          callbackType: profile.callbackType,
        },
      ],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : `LinkedIn enrichment queue request failed with HTTP ${response.status}`
    );
  }
  return {
    batchId: String(payload?.batchId || batchId),
    statusUrl: String(payload?.statusUrl || `/batches/${batchId}`),
    status: 'queued',
    remote: true,
  };
}

export async function runRemoteLinkedInScraperScript(
  script: string,
  args: string[],
  runtime?: RuntimeEnv,
  timeoutMs = DEFAULT_REMOTE_SCRAPER_TIMEOUT_MS
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
  timeoutMs = DEFAULT_REMOTE_SCRAPER_TIMEOUT_MS
): Promise<RemoteLinkedInScraperResult> {
  requireRemoteLinkedInScraperConfig(runtime);
  const result = await runRemoteLinkedInScraperScript(script, args, runtime, timeoutMs);
  if (!result) {
    throw new Error('Railway LinkedIn scraper is not configured.');
  }
  return result;
}
