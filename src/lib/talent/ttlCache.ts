type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

/** Tiny process-local TTL cache for hot founder role reads. */
export function getTtlCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setTtlCache<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expiresAt: Date.now() + Math.max(1_000, ttlMs) });
}

export function invalidateTtlCachePrefix(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
