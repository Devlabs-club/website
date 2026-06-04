export type CachedAuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'founder';
  createdAt?: string;
};

const AUTH_USER_KEY = 'devlabs:auth:user';
const AUTH_USER_TS_KEY = 'devlabs:auth:user:ts';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readCachedAuthUser(): CachedAuthUser | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(AUTH_USER_KEY);
    const ts = sessionStorage.getItem(AUTH_USER_TS_KEY);
    if (!raw || !ts) return null;
    if (Date.now() - Number(ts) > MAX_AGE_MS) {
      clearCachedAuthUser();
      return null;
    }
    return JSON.parse(raw) as CachedAuthUser;
  } catch {
    return null;
  }
}

export function writeCachedAuthUser(user: CachedAuthUser): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(AUTH_USER_TS_KEY, String(Date.now()));
  } catch {
    // ignore storage quota errors
  }
}

export function clearCachedAuthUser(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_USER_TS_KEY);
  } catch {
    // ignore
  }
}
