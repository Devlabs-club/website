import React, { useEffect, useState } from 'react';
import type { TrialProjectDraft } from './founderTypes';

const emptyDraft = (): TrialProjectDraft => ({
  title: '',
  goal: '',
  deliverables: [''],
  timeline: '1 week',
  suggestedPayRange: '',
  successCriteria: [''],
});

function linesFromList(items: string[]) {
  return items.filter(Boolean).join('\n');
}

function listFromLines(text: string) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function FounderTrialProjectCard({
  opportunityId,
  builderId,
  initialProject,
  onSaved,
  callCompleted,
}: {
  opportunityId: string;
  builderId: string;
  initialProject: TrialProjectDraft | null;
  onSaved: () => void;
  callCompleted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TrialProjectDraft | null>(initialProject);
  const [form, setForm] = useState<TrialProjectDraft>(initialProject || emptyDraft());
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initialProject);
    if (initialProject) setForm(initialProject);
  }, [initialProject]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'generate_trial_project',
          payload: { opportunityId, builderId },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Generation failed');
      const project = data.trialProject as TrialProjectDraft;
      setDraft(project);
      setForm(project);
      setEditing(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate trial project');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        deliverables: listFromLines(linesFromList(form.deliverables)),
        successCriteria: listFromLines(linesFromList(form.successCriteria)),
      };
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save_trial_project',
          payload: { opportunityId, builderId, trialProject: payload },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Save failed');
      setDraft(data.trialProject);
      setForm(data.trialProject);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'send_trial_project',
          payload: { opportunityId, builderId },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Send failed');
      setDraft(data.trialProject);
      setForm(data.trialProject);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send trial');
    } finally {
      setSending(false);
    }
  };

  const statusBadge = draft?.status && draft.status !== 'draft' ? (
    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#fa7d22]/30 text-[#ffb580]">
      {draft.status.replace(/_/g, ' ')}
    </span>
  ) : null;

  const canSend =
    callCompleted &&
    draft &&
    ['draft', 'rejected'].includes(draft.status || 'draft') &&
    draft.status !== 'sent' &&
    draft.status !== 'submitted';

  if (!draft && !editing) {
    return (
      <section className="rounded-xl border border-[#fa7d22]/25 bg-[#fa7d22]/10 p-4">
        <h3 className="text-xs uppercase tracking-wider text-[#ffb580] mb-2">Trial project</h3>
        <p className="text-sm text-white/70 mb-4">
          Scope a paid sprint before a longer engagement — concrete deliverables, timeline, and success bar.
        </p>
        {error ? <p className="text-sm text-amber-300 mb-3">{error}</p> : null}
        <button
          type="button"
          disabled={generating}
          onClick={handleGenerate}
          className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate trial project'}
        </button>
      </section>
    );
  }

  if (editing) {
    return (
      <section className="rounded-xl border border-[#fa7d22]/25 bg-[#fa7d22]/10 p-4 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-[#ffb580]">Edit trial draft</h3>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/45">Title</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/45">Goal</span>
          <textarea
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/45">Deliverables (one per line)</span>
          <textarea
            value={linesFromList(form.deliverables)}
            onChange={(e) => setForm({ ...form, deliverables: listFromLines(e.target.value) })}
            rows={4}
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-white/45">Timeline</span>
            <input
              value={form.timeline}
              onChange={(e) => setForm({ ...form, timeline: e.target.value })}
              className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-white/45">Suggested pay</span>
            <input
              value={form.suggestedPayRange}
              onChange={(e) => setForm({ ...form, suggestedPayRange: e.target.value })}
              className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/45">Success criteria (one per line)</span>
          <textarea
            value={linesFromList(form.successCriteria)}
            onChange={(e) => setForm({ ...form, successCriteria: listFromLines(e.target.value) })}
            rows={3}
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none"
          />
        </label>
        {error ? <p className="text-sm text-amber-300">{error}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              if (draft) setForm(draft);
            }}
            className="px-4 py-2 rounded-xl border border-white/20 text-white/80 text-sm hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[#fa7d22]/25 bg-[#fa7d22]/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wider text-[#ffb580]">Trial project</h3>
        <div className="flex items-center gap-2">
          {statusBadge}
          {draft?.updatedAt ? (
            <span className="text-[10px] text-white/40">Saved {new Date(draft.updatedAt).toLocaleDateString()}</span>
          ) : null}
        </div>
      </div>
      <p className="font-medium text-white text-sm">{draft?.title}</p>
      <p className="text-sm text-white/80">{draft?.goal}</p>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Deliverables</p>
        <ul className="text-sm text-white/75 space-y-1 list-disc list-inside">
          {draft?.deliverables.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-white/70">
        <span className="text-white/45">Timeline · </span>
        {draft?.timeline}
        <span className="text-white/45"> · Pay · </span>
        {draft?.suggestedPayRange}
      </p>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1">Success criteria</p>
        <ul className="text-sm text-white/75 space-y-1 list-disc list-inside">
          {draft?.successCriteria.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      {!callCompleted ? (
        <p className="text-xs text-white/50">Complete the intro call before sending a trial.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <button
            type="button"
            disabled={sending}
            onClick={handleSend}
            className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Approve & send to builder'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={generating}
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-lg border border-white/20 text-white text-xs hover:bg-white/5"
        >
          Edit draft
        </button>
        <button
          type="button"
          disabled={generating}
          onClick={handleGenerate}
          className="px-3 py-1.5 rounded-lg border border-white/20 text-white/70 text-xs hover:bg-white/5 disabled:opacity-50"
        >
          {generating ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>
    </section>
  );
}
