/** HttpOnly session cookie for JWT auth (login + register). */
export function buildAuthTokenCookie(token: string): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `auth-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

export function clearAuthTokenCookie(): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `auth-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
