import type { RuntimeEnv } from './workosEnv';

function envStr(key: string, runtime?: RuntimeEnv): string | undefined {
  const fromRuntime = runtime?.[key]?.trim();
  if (fromRuntime) return fromRuntime;
  if (typeof process !== 'undefined') {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof fromMeta === 'string' ? fromMeta.trim() : undefined;
}

/**
 * OAuth redirect URI must match what WorkOS has registered.
 * In production, always use WORKOS_REDIRECT_URI (or WEBSITE_ROOT) from env — never infer from the request host.
 */
export function getOAuthRedirectUri(request: Request, runtime?: RuntimeEnv): string {
  const configured = envStr('WORKOS_REDIRECT_URI', runtime);
  const websiteRoot = envStr('WEBSITE_ROOT', runtime)?.replace(/\/$/, '');

  if (import.meta.env.PROD) {
    if (configured && !configured.includes('localhost')) {
      return configured;
    }
    if (websiteRoot) {
      return `${websiteRoot}/api/auth/oauth/callback`;
    }
  }

  const origin = new URL(request.url).origin;
  const isLocal =
    origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('[::1]');

  if (isLocal) {
    if (configured?.trim()) {
      return configured.trim();
    }
    return `${origin}/api/auth/oauth/callback`;
  }

  // Preview / staging: use request origin so branch deploys work without changing WorkOS.
  return `${origin}/api/auth/oauth/callback`;
}

/** Only allow same-site relative redirects after OAuth (blocks localhost in state). */
export function sanitizePostAuthRedirect(
  redirectUrl: string,
  request: Request,
  runtime?: RuntimeEnv
): string {
  const fallback = '/dashboard';

  if (!redirectUrl?.trim()) return fallback;

  const trimmed = redirectUrl.trim();
  const allowedOrigins = new Set<string>([new URL(request.url).origin]);
  const websiteRoot = envStr('WEBSITE_ROOT', runtime)?.replace(/\/$/, '');
  if (websiteRoot) allowedOrigins.add(websiteRoot);

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
