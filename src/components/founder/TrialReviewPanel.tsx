import React, { useState } from 'react';
import type { TrialProjectDraft } from './founderTypes';

export default function TrialReviewPanel({
  opportunityId,
  builderId,
  builderName,
  trialProject,
  onClose,
  onReviewed,
}: {
  opportunityId: string;
  builderId: string;
  builderName: string;
  trialProject: TrialProjectDraft;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rejectionCount = trialProject.rejectionCount || 0;
  const requiresNote = rejectionCount >= 2;

  const review = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && requiresNote && note.trim().length < 20) {
      setError('Please provide a rejection note of at least 20 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'review_trial_submission',
          payload: { opportunityId, builderId, decision, note: note.trim() || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Review failed');
      onReviewed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#111] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-1">Review trial submission</h2>
        <p className="text-sm text-white/60 mb-4">{builderName} · {trialProject.title}</p>

        {trialProject.submission ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4 space-y-2 text-sm">
            {trialProject.submission.demoUrl ? (
              <p>
                <span className="text-white/45">Demo: </span>
                <a href={trialProject.submission.demoUrl} target="_blank" rel="noreferrer" className="text-[#ffb580] hover:underline">
                  {trialProject.submission.demoUrl}
                </a>
              </p>
            ) : null}
            {trialProject.submission.githubUrl ? (
              <p>
                <span className="text-white/45">GitHub: </span>
                <a href={trialProject.submission.githubUrl} target="_blank" rel="noreferrer" className="text-[#ffb580] hover:underline">
                  {trialProject.submission.githubUrl}
                </a>
              </p>
            ) : null}
            {trialProject.submission.notes ? (
              <p className="text-white/75">{trialProject.submission.notes}</p>
            ) : null}
          </div>
        ) : null}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            requiresNote
              ? 'Rejection note required (min 20 characters)…'
              : 'Optional feedback if rejecting…'
          }
          rows={3}
          className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none mb-3"
        />

        {error ? <p className="text-sm text-amber-300 mb-3">{error}</p> : null}

        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-white/20 text-white/80 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => review('reject')}
            className="px-4 py-2 rounded-xl border border-red-400/30 text-red-300 text-sm disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => review('approve')}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-sm font-semibold disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
