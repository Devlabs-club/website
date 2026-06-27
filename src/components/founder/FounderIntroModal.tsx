import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OsButton } from '@/components/os';
import type { FullCandidate } from './founderTypes';

export default function FounderIntroModal({
  candidate,
  opportunityId,
  onClose,
  onSent,
}: {
  candidate: FullCandidate;
  opportunityId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'suggest_intro_message',
            payload: { opportunityId, builderId: candidate.builderId },
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load message');
        if (!cancelled) setMessage(data.suggestedMessage || '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load suggestion');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opportunityId, candidate.builderId]);

  const handleSend = async () => {
    const text = message.trim();
    if (text.length < 20) {
      setError('Intro message must be at least 20 characters.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'request_intro',
          payload: {
            opportunityId,
            builderId: candidate.builderId,
            introMessage: text,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to send intro');
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send intro');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-panel-strong border-white/15 bg-[#0c0d0f]/95 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request intro</DialogTitle>
          <DialogDescription className="text-white/55">
            To {candidate.name} · {candidate.matchLabel}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-white/50 py-8 text-center animate-pulse">Generating suggested message…</p>
        ) : (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#fa7d22]/50 resize-none"
            placeholder="Write your intro message…"
          />
        )}

        {error ? <p className="text-sm text-amber-300">{error}</p> : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <OsButton variant="glass" onClick={onClose} className="flex-1">
            Cancel
          </OsButton>
          <OsButton variant="shimmer" onClick={handleSend} disabled={loading || sending || message.trim().length < 20} className="flex-1">
            {sending ? 'Sending…' : 'Send intro request'}
          </OsButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
