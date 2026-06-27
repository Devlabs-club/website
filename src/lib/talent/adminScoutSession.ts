const SCOUT_EMAIL_DOMAIN = 'internal.devlabs';
const SCOUT_SESSION_MIN_LEN = 8;
const SCOUT_SESSION_MAX_LEN = 128;

type RateBucket = { chat: number; search: number; windowStart: number };

const rateBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_CHAT_PER_WINDOW = 40;
const MAX_SEARCH_PER_WINDOW = 10;

export type AdminScoutIdentity = {
  scoutSessionId: string;
  founderEmail: string;
  founderId: string;
  founderName: string;
};

export function isAdminScoutEnabled(): boolean {
  return process.env.ENABLE_ADMIN_SCOUT !== 'false';
}

export function validateScoutSessionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (id.length < SCOUT_SESSION_MIN_LEN || id.length > SCOUT_SESSION_MAX_LEN) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}

export function resolveAdminScoutIdentity(scoutSessionId: string): AdminScoutIdentity {
  return {
    scoutSessionId,
    founderEmail: `scout+${scoutSessionId}@${SCOUT_EMAIL_DOMAIN}`,
    founderId: `scout_${scoutSessionId}`,
    founderName: 'Admin Scout',
  };
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < 500) return;
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.windowStart > WINDOW_MS) rateBuckets.delete(key);
  }
}

export function checkAdminScoutRateLimit(
  request: Request,
  scoutSessionId: string,
  action: 'admin_scout_chat' | 'admin_scout_search'
): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  pruneRateBuckets(now);
  const key = `${clientIp(request)}:${scoutSessionId}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { chat: 0, search: 0, windowStart: now };
    rateBuckets.set(key, bucket);
  }

  if (action === 'admin_scout_chat') {
    bucket.chat += 1;
    if (bucket.chat > MAX_CHAT_PER_WINDOW) {
      return { ok: false, error: 'Rate limit reached. Try again in a few minutes.' };
    }
  } else {
    bucket.search += 1;
    if (bucket.search > MAX_SEARCH_PER_WINDOW) {
      return { ok: false, error: 'Search rate limit reached. Try again in a few minutes.' };
    }
  }

  return { ok: true };
}

export const ADMIN_SCOUT_SESSION_STORAGE_KEY = 'devlabs_scout_session';
