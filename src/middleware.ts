import { defineMiddleware } from 'astro:middleware';
import { extractTokenFromCookies, verifyToken, type JWTPayload } from '@/lib/auth';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

/** Surfaces that require a session cookie before any HTML is served. */
const AUTH_PREFIXES = ['/admin', '/founder', '/builder', '/dashboard', '/auth/select-role'];

/** Public builder surfaces that must stay reachable without login. */
const PUBLIC_BUILDER_PATHS = [
  /^\/builder\/p\//,
  /^\/builder\/claim\//,
  /^\/builder\/wrapped\//,
  /^\/builder\/start$/,
  /^\/builder\/welcome$/,
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicBuilderPath(pathname: string): boolean {
  return PUBLIC_BUILDER_PATHS.some((pattern) => pattern.test(pathname));
}

function requiresAuth(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false;
  if (!AUTH_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return false;
  if (isPublicBuilderPath(pathname)) return false;
  return true;
}

function loginRedirect(pathname: string, search: string): string {
  const redirectTarget = `${pathname}${search || ''}`;
  return `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;
}

function readPayload(
  cookieHeader: string,
  runtime: ReturnType<typeof runtimeEnvFromLocals>
): JWTPayload | null {
  const token = extractTokenFromCookies(cookieHeader);
  if (!token) return null;
  try {
    return verifyToken(token, runtime);
  } catch {
    return null;
  }
}

function hasRole(payload: JWTPayload, roles: string[]): boolean {
  return roles.includes(String(payload.role || ''));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  if (!requiresAuth(pathname)) return next();

  const runtime = runtimeEnvFromLocals(context.locals);
  const cookieHeader = context.request.headers.get('cookie') || '';
  const payload = readPayload(cookieHeader, runtime);

  // Unauthenticated → login / signup first.
  if (!payload?.userId) {
    return context.redirect(loginRedirect(pathname, search));
  }

  // /admin → only admins; everyone else gets a 404 (do not leak the surface).
  if (matchesPrefix(pathname, '/admin')) {
    if (!hasRole(payload, ['admin'])) {
      return context.redirect('/404');
    }
    return next();
  }

  // /dashboard + /auth/select-role → any authenticated user.
  if (matchesPrefix(pathname, '/dashboard') || pathname === '/auth/select-role') {
    return next();
  }

  // /founder → founders only (admins allowed for ops). Unscoped role → pick one.
  if (matchesPrefix(pathname, '/founder')) {
    // The claim landing turns any authenticated user into a founder (binds a role
    // DevLabs pre-built for them), so it must run before the founder-role gate.
    if (pathname.startsWith('/founder/claim/')) return next();
    if (hasRole(payload, ['founder', 'admin'])) return next();
    if (hasRole(payload, ['user'])) {
      return context.redirect(`/auth/select-role?redirect=${encodeURIComponent(`${pathname}${search || ''}`)}`);
    }
    return context.redirect('/access-denied?area=founder');
  }

  // /builder (private) → builders only (admins allowed for ops).
  if (matchesPrefix(pathname, '/builder')) {
    if (hasRole(payload, ['builder', 'admin'])) return next();
    if (hasRole(payload, ['user'])) {
      return context.redirect(`/auth/select-role?redirect=${encodeURIComponent(`${pathname}${search || ''}`)}`);
    }
    return context.redirect('/access-denied?area=builder');
  }

  return next();
});
