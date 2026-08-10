import type { RuntimeEnv } from './workosEnv';

function envStr(key: string, runtime?: RuntimeEnv): string | undefined {
  const fromRuntime = runtime?.[key]?.trim();
  if (fromRuntime) return fromRuntime;
  if (typeof process !== 'undefined') {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  return undefined;
}

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function isLocalOrigin(origin: string): boolean {
  return (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('[::1]')
  );
}

/** Site root from env (WEBSITE_ROOT) or the current request origin. */
export function getWebsiteRoot(request: Request, runtime?: RuntimeEnv): string {
  const fromEnv = envStr('WEBSITE_ROOT', runtime)?.replace(/\/$/, '');
  const origin = requestOrigin(request);

  if (!fromEnv) return origin;

  // Local dev: wrangler.toml may inject production WEBSITE_ROOT via platformProxy — prefer localhost.
  if (isLocalOrigin(origin) && !isLocalOrigin(fromEnv)) {
    return origin;
  }

  return fromEnv;
}

/**
 * OAuth callback URL registered in WorkOS.
 * Uses WORKOS_REDIRECT_URI when set; otherwise WEBSITE_ROOT + /api/auth/oauth/callback.
 */
export function getOAuthRedirectUri(request: Request, runtime?: RuntimeEnv): string {
  const configured = envStr('WORKOS_REDIRECT_URI', runtime)?.trim();
  const root = getWebsiteRoot(request, runtime);
  const origin = requestOrigin(request);

  if (configured) {
    if (isLocalOrigin(origin)) {
      try {
        if (isLocalOrigin(new URL(configured).origin)) {
          return configured;
        }
      } catch {
        // fall through to WEBSITE_ROOT / request origin
      }
      // Ignore production redirect URI while developing on localhost.
    } else {
      return configured;
    }
  }

  return `${root}/api/auth/oauth/callback`;
}

/** Only allow same-site relative redirects after OAuth (default /dashboard). */
export function sanitizePostAuthRedirect(
  redirectUrl: string,
  request: Request,
  runtime?: RuntimeEnv
): string {
  const fallback = '/dashboard';

  if (!redirectUrl?.trim()) return fallback;

  const trimmed = redirectUrl.trim();
  const allowedOrigins = new Set<string>([requestOrigin(request)]);
  allowedOrigins.add(getWebsiteRoot(request, runtime));

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const target = new URL(trimmed);
    if (allowedOrigins.has(target.origin)) {
      return `${target.pathname}${target.search}`;
    }
  } catch {
    // ignore invalid URLs
  }

  return fallback;
}
