import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

export type IntroInboxItem = {
  _id: string;
  opportunityId: string;
  builderId: string;
  founderName: string;
  introMessage: string;
  roleTitle: string;
  company: string;
  startupSummary?: string | null;
  timeline?: string | null;
  budget?: string | null;
  viewedAt?: string | null;
  createdAt: string;
};

export default function BuilderIntroInbox({
  items,
  onResponded,
}: {
  items: IntroInboxItem[];
  onResponded: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?._id || null);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineFor, setShowDeclineFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (intro: IntroInboxItem, response: 'view' | 'accept' | 'decline') => {
    setBusyId(intro._id);
    setError(null);
    try {
      const responseBody: Record<string, unknown> = {
        action: 'respond_intro',
        payload: { introRequestId: intro._id, response },
      };
      if (response === 'decline') {
        responseBody.payload = {
          ...responseBody.payload,
          declineReason: declineReason.trim() || undefined,
        };
      }
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(responseBody),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      setShowDeclineFor(null);
      setDeclineReason('');
      onResponded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const openIntro = async (intro: IntroInboxItem) => {
    setExpandedId(intro._id);
    if (!intro.viewedAt) {
      await respond(intro, 'view');
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/20 bg-white/[0.02] p-12 text-center">
        <p className="text-white/60 text-sm">No pending intro requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      {items.map((intro) => (
        <div
          key={intro._id}
          className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{intro.roleTitle}</h3>
              <p className="text-sm text-white/60">
                {intro.company} · from {intro.founderName}
              </p>
            </div>
            <span className="text-xs uppercase tracking-wider text-[#ffb580] border border-[#fa7d22]/30 px-2 py-1 rounded-full">
              Intro request
            </span>
          </div>

          {intro.startupSummary ? (
            <p className="text-sm text-white/70 mb-3">{intro.startupSummary}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            {intro.timeline ? (
              <div>
                <p className="text-[10px] uppercase text-white/40">Timeline</p>
                <p className="text-white/80">{intro.timeline}</p>
              </div>
            ) : null}
            {intro.budget ? (
              <div>
                <p className="text-[10px] uppercase text-white/40">Budget</p>
                <p className="text-white/80">{intro.budget}</p>
              </div>
            ) : null}
          </div>

          {expandedId === intro._id ? (
            <div className="rounded-xl bg-black/30 border border-white/10 p-4 mb-4">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Intro message</p>
              <p className="text-sm text-white/85 whitespace-pre-wrap">{intro.introMessage}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openIntro(intro)}
              className="text-sm text-[#ffb580] hover:text-[#fa7d22] mb-4"
            >
              Read intro message
            </button>
          )}

          {showDeclineFor === intro._id ? (
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Optional reason for declining…"
              rows={2}
              className="w-full mb-3 rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none"
            />
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={busyId === intro._id}
              onClick={() => respond(intro, 'accept')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Accept intro
            </button>
            {showDeclineFor === intro._id ? (
              <button
                type="button"
                disabled={busyId === intro._id}
                onClick={() => respond(intro, 'decline')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-400/40 text-red-300 text-sm hover:bg-red-500/10 disabled:opacity-50"
              >
                Confirm decline
              </button>
            ) : (
              <button
                type="button"
                disabled={busyId === intro._id}
                onClick={() => setShowDeclineFor(intro._id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 text-white/70 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                <X className="w-4 h-4" /> Decline
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
