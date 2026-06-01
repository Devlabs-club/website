/**
 * OAuth redirect URI must match the host the user is signing in on.
 * Vercel often has WORKOS_REDIRECT_URI set to localhost from local dev — that
 * sends preview/production users to localhost after Google sign-in.
 */
export function getOAuthRedirectUri(request: Request): string {
  const configured = import.meta.env.WORKOS_REDIRECT_URI;

  // Stable per-branch URL on Vercel (e.g. devlabs-website-git-devlabs-os-….vercel.app)
  const branchHost =
    (typeof process !== 'undefined' && process.env?.VERCEL_BRANCH_URL) ||
    import.meta.env.VERCEL_BRANCH_URL;
  if (branchHost) {
    return `https://${branchHost}/api/auth/oauth/callback`;
  }

  const origin = new URL(request.url).origin;
  const isLocal =
    origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('[::1]');

  if (!isLocal) {
    return `${origin}/api/auth/oauth/callback`;
  }

  if (configured?.trim()) {
    return configured.trim();
  }

  return `${origin}/api/auth/oauth/callback`;
}

/** Only allow same-site relative redirects after OAuth (blocks localhost in state). */
export function sanitizePostAuthRedirect(redirectUrl: string, request: Request): string {
  const fallback = '/dashboard';

  if (!redirectUrl?.trim()) return fallback;

  const trimmed = redirectUrl.trim();

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const target = new URL(trimmed);
    const current = new URL(request.url);
    if (target.origin === current.origin) {
      return `${target.pathname}${target.search}`;
    }
  } catch {
    // ignore invalid URLs
  }

  return fallback;
}
