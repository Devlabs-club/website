import React, { useEffect, useState } from 'react';
import { X, Send, Loader2, Sparkles } from 'lucide-react';
import type { FullCandidate } from './founderTypes';

export default function IntroRequiredModal({
  candidate,
  opportunityId,
  onClose,
  onIntroSent,
  onRequestIntro,
}: {
  candidate: FullCandidate;
  opportunityId: string;
  onClose: () => void;
  onIntroSent: () => void;
  onRequestIntro: (candidate: FullCandidate) => void;
}) {
  const [suggested, setSuggested] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'suggest_intro_message',
            payload: { opportunityId, builderId: candidate.builderId },
          }),
        });
        const data = await res.json();
        if (data.success && data.suggestedMessage) {
          setSuggested(data.suggestedMessage);
          setMessage(data.suggestedMessage);
        } else {
          const fallback = `Hey ${candidate.name.split(' ')[0]}, I'd love to connect about this role. Your proof-of-work stood out — open to a quick intro?`;
          setSuggested(fallback);
          setMessage(fallback);
        }
      } catch {
        const fallback = `Hey ${candidate.name.split(' ')[0]}, I'd love to connect about this role. Your proof-of-work stood out — open to a quick intro?`;
        setSuggested(fallback);
        setMessage(fallback);
      } finally {
        setLoading(false);
      }
    })();
  }, [candidate.builderId, candidate.name, opportunityId]);

  const sendIntro = async () => {
    const body = message.trim();
    if (body.length < 20) {
      setError('Intro message must be at least 20 characters.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'request_intro',
          payload: {
            opportunityId,
            builderId: candidate.builderId,
            introMessage: body,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send intro');
      onIntroSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send intro');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <motionBackdrop onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl border border-[#fa7d22]/30 bg-[#0c0d0f] shadow-[0_0_60px_rgba(250,125,34,0.15)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#fa7d22]/10 via-transparent to-violet-600/10 pointer-events-none" />
        <div className="relative p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#ffb580] font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Send intro first
              </p>
              <h2 className="text-lg font-bold text-white mt-1">Move {candidate.name} to Interviewing</h2>
              <p className="text-sm text-white/55 mt-1">
                You need to send an intro before this builder enters your interviewing pipeline.
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center text-white/50">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#fa7d22]/40 resize-none"
                placeholder="Write your intro message based on the role..."
              />
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={sending}
                  onClick={sendIntro}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#fa7d22] text-black font-bold disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send intro
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequestIntro(candidate);
                  }}
                  className="px-4 py-3 rounded-xl border border-white/15 text-white/70 text-sm hover:bg-white/5"
                >
                  Customize
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function motionBackdrop({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      onClick={onClick}
      aria-label="Close"
    />
  );
}
