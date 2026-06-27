import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Calendar } from 'lucide-react';
import type { TrialProjectDraft } from './founderTypes';

export default function FounderTrialSidebar({
  opportunityId,
  builderId,
  builderName,
  roleTitle,
  onClose,
  onSent,
}: {
  opportunityId: string;
  builderId: string;
  builderName: string;
  roleTitle?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState<TrialProjectDraft | null>(null);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDraft = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'generate_trial_project',
          payload: { opportunityId, builderId },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not generate trial');
      setDraft(data.trialProject);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    generateDraft();
  }, [opportunityId, builderId]);

  const sendTrial = async () => {
    if (!draft || !deadlineDate) {
      setError('Pick a deadline date before sending.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save_trial_project',
          payload: { opportunityId, builderId, trialProject: draft },
        }),
      });

      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'send_trial_project',
          payload: { opportunityId, builderId, deadlineDate },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not send trial');
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md h-full bg-[#0c0d0f] border-l border-white/10 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0c0d0f]/95 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold text-white">Work trial</h2>
            <p className="text-xs text-white/50">{builderName}{roleTitle ? ` · ${roleTitle}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          ) : null}

          <button
            type="button"
            onClick={generateDraft}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#fa7d22]/30 text-[#ffb580] text-sm font-semibold hover:bg-[#fa7d22]/10 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating take-home...' : 'Regenerate with AI'}
          </button>

          {draft ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3 text-sm">
              <h3 className="font-semibold text-white">{draft.title}</h3>
              <p className="text-white/75">{draft.goal}</p>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40 mb-1">Deliverables</p>
                <ul className="list-disc list-inside text-white/70 space-y-1">
                  {draft.deliverables.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40 mb-1">Success criteria</p>
                <ul className="list-disc list-inside text-white/70 space-y-1">
                  {draft.successCriteria.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : generating ? (
            <div className="py-8 text-center text-white/45 text-sm">Crafting a take-home aligned to your job brief...</div>
          ) : null}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/45">
              <Calendar className="w-3.5 h-3.5" />
              Deadline (due 12:00 PM that day)
            </label>
            <input
              type="date"
              min={minDate}
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="w-full rounded-xl bg-[#0e1012] border border-white/10 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#fa7d22]/40"
            />
          </div>

          <button
            type="button"
            onClick={sendTrial}
            disabled={sending || !draft || !deadlineDate}
            className="w-full px-4 py-3 rounded-xl bg-[#fa7d22] text-black font-bold disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send trial to builder'}
          </button>
          <p className="text-xs text-white/40 text-center">Unpaid take-home · GitHub + walkthrough video submission</p>
        </div>
      </div>
    </div>
  );
}
