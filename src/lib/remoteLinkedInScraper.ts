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

const TERMINAL_ITEM_STATUSES = new Set(['succeeded', 'failed', 'blocked']);

function isDirectScrapingDisabledError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /direct_scraping_disabled|Submit a job to POST \/batches/i.test(message);
}

/**
 * Prefer instant POST /run. If the scraper build still disables /run (410),
 * fall back to a single-item batch and wait until the artifact is ready so the
 * website request never returns before LinkedIn data can be applied.
 */
export async function runInstantRemoteLinkedInBuilderEnrichment(
  builder: { id: string; name: string; linkedInUrl: string },
  runtime?: RuntimeEnv,
  timeoutMs = 150_000
): Promise<RemoteLinkedInScraperResult | null> {
  const config = getRemoteLinkedInScraperConfig(runtime);
  if (!config) return null;

  try {
    return await runRemoteLinkedInScraperScript(
      'enrich-builder-linkedin-cdp.mjs',
      [
        '--linkedin-url',
        builder.linkedInUrl,
        '--name',
        builder.name,
        '--output-key',
        builder.id,
        '--wait-ms',
        '12000',
      ],
      runtime,
      timeoutMs
    );
  } catch (error) {
    if (!isDirectScrapingDisabledError(error)) throw error;
    console.warn(
      '[linkedin-scraper] /run disabled on Railway; waiting on single-item batch instead'
    );
  }

  const queued = await queueRemoteLinkedInBuilderEnrichment(builder, runtime);
  if (!queued) return null;
  return waitForQueuedLinkedInArtifact(queued.batchId, builder.id, runtime, timeoutMs);
}

async function waitForQueuedLinkedInArtifact(
  batchId: string,
  builderId: string,
  runtime?: RuntimeEnv,
  timeoutMs = 150_000
): Promise<RemoteLinkedInScraperResult> {
  const config = requireRemoteLinkedInScraperConfig(runtime);
  const started = Date.now();
  let lastStatus = 'queued';

  while (Date.now() - started < timeoutMs) {
    const statusRes = await fetch(`${config.url}/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${config.secret}` },
    });
    const statusPayload = await statusRes.json().catch(() => null);
    if (!statusRes.ok) {
      throw new Error(
        typeof statusPayload?.message === 'string'
          ? statusPayload.message
          : `LinkedIn batch status failed with HTTP ${statusRes.status}`
      );
    }

    const item = Array.isArray(statusPayload?.items)
      ? statusPayload.items.find((candidate: any) => String(candidate?.builderId) === builderId)
      : null;
    lastStatus = String(item?.status || statusPayload?.status || lastStatus);

    if (item && TERMINAL_ITEM_STATUSES.has(String(item.status))) {
      if (item.status !== 'succeeded') {
        throw new Error(
          typeof item.error === 'string' && item.error
            ? item.error
            : `LinkedIn enrichment ${item.status}`
        );
      }
      const artifactRes = await fetch(`${config.url}/batches/${batchId}/artifacts/${builderId}`, {
        headers: { Authorization: `Bearer ${config.secret}` },
      });
      const artifact = await artifactRes.json().catch(() => null);
      if (!artifactRes.ok || !artifact) {
        throw new Error(
          typeof artifact?.message === 'string'
            ? artifact.message
            : `LinkedIn artifact fetch failed with HTTP ${artifactRes.status}`
        );
      }
      return { summary: item.summary || null, artifact, remote: true };
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`LinkedIn enrichment timed out after ${timeoutMs}ms (last status: ${lastStatus})`);
}

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
