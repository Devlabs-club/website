import { useEffect, useRef, useCallback } from 'react';

type RealtimeEvent = {
  type: string;
  collection?: string;
  operationType?: string;
  documentId?: string;
  at?: string;
};

export function useTalentRealtime(params: {
  enabled?: boolean;
  scope?: 'founder' | 'builder';
  opportunityId?: string | null;
  onEvent: () => void;
}) {
  const { enabled = true, scope = 'founder', opportunityId, onEvent } = params;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const refresh = useCallback(() => {
    onEventRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let es: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const params = new URLSearchParams({ scope });
    if (opportunityId) params.set('opportunityId', opportunityId);

    const connect = () => {
      es = new EventSource(`/api/talent/realtime?${params.toString()}`);

      es.onmessage = () => {
        refresh();
      };

      es.addEventListener('change', () => {
        refresh();
      });

      es.onerror = () => {
        es?.close();
        es = null;
      };
    };

    connect();
    pollId = setInterval(refresh, 4000);

    return () => {
      closed = true;
      es?.close();
      if (pollId) clearInterval(pollId);
    };
  }, [enabled, scope, opportunityId, refresh]);

  return { refresh };
}
