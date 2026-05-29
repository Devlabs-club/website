import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0c0d0f] shadow-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Request intro</h2>
            <p className="text-sm text-white/55 mt-1">
              To {candidate.name} · {candidate.matchLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-white/45 mb-2">
          Edit the message below before sending. The builder will receive this intro request.
        </p>

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

        {error ? <p className="text-sm text-amber-300 mt-2">{error}</p> : null}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/20 text-white text-sm hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || sending || message.trim().length < 20}
            onClick={handleSend}
            className="flex-1 py-2.5 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send intro request'}
          </button>
        </div>
      </div>
    </div>
  );
}
