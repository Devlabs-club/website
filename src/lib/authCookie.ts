/** HttpOnly session cookie for JWT auth (login + register). */
export function buildAuthTokenCookie(token: string): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `auth-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

export function buildWorkOSSessionCookie(sealedSession: string): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `wos-session=${sealedSession}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

export function buildPendingAuthCookie(token: string): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `wos-pending-auth=${token}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}

export function clearAuthTokenCookie(): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `auth-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function clearPendingAuthCookie(): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `wos-pending-auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function jsonWithCookies(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function readPendingAuthCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'wos-pending-auth') {
      const value = rest.join('=').trim();
      return value || null;
    }
  }
  return null;
}
