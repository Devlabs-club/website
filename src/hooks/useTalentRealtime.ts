import { useEffect, useRef, useCallback } from 'react';

export function useTalentRealtime(params: {
  enabled?: boolean;
  scope?: 'founder' | 'builder';
  opportunityId?: string | null;
  onEvent: () => void;
  /** Minimum ms between refresh callbacks (default 10s) */
  minIntervalMs?: number;
}) {
  const { enabled = true, scope = 'founder', opportunityId, onEvent, minIntervalMs = 10_000 } = params;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const lastRefreshRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastRefreshRef.current;

    const run = () => {
      lastRefreshRef.current = Date.now();
      onEventRef.current();
    };

    if (elapsed >= minIntervalMs) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      run();
      return;
    }

    if (debounceRef.current) return;

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      run();
    }, minIntervalMs - elapsed);
  }, [minIntervalMs]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let es: EventSource | null = null;

    const params = new URLSearchParams({ scope });
    if (opportunityId) params.set('opportunityId', opportunityId);

    es = new EventSource(`/api/talent/realtime?${params.toString()}`);

    es.onmessage = () => refresh();
    es.addEventListener('change', () => refresh());
    es.onerror = () => {
      es?.close();
      es = null;
    };

    return () => {
      es?.close();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, scope, opportunityId, refresh]);

  return { refresh };
}
