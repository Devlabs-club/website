import React, { useState } from 'react';
import type { TrialProjectDraft } from '@/components/founder/founderTypes';

export type BuilderTrialItem = {
  matchId: string;
  opportunityId: string;
  builderId: string;
  matchStatus: string;
  roleTitle: string;
  company: string;
  founderName: string;
  trialProject: TrialProjectDraft | null;
};

export default function BuilderTrialPanel({
  trials,
  onSubmitted,
}: {
  trials: BuilderTrialItem[];
  onSubmitted: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { videoUrl: string; githubUrl: string; notes: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const getForm = (id: string) =>
    forms[id] || { videoUrl: '', githubUrl: '', notes: '' };

  const submit = async (trial: BuilderTrialItem) => {
    const form = getForm(trial.matchId);
    setBusyId(trial.matchId);
    setError(null);
    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'submit_trial',
          payload: {
            opportunityId: trial.opportunityId,
            videoUrl: form.videoUrl,
            githubUrl: form.githubUrl,
            notes: form.notes,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Submit failed');
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setBusyId(null);
    }
  };

  if (trials.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/20 bg-white/[0.02] p-12 text-center">
        <p className="text-white/60 text-sm">No active trial projects.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      {trials.map((trial) => {
        const project = trial.trialProject;
        const canSubmit =
          project &&
          ['sent', 'in_progress', 'rejected'].includes(project.status || '') &&
          project.status !== 'submitted';
        const isSubmitted = project?.status === 'submitted';

        return (
          <div key={trial.matchId} className="rounded-2xl border border-[#fa7d22]/20 bg-[#fa7d22]/5 p-6">
            <div className="flex flex-wrap justify-between gap-2 mb-3">
              <div>
                <h3 className="text-lg font-semibold">{project?.title || trial.roleTitle}</h3>
                <p className="text-sm text-white/60">
                  {trial.company} · {trial.founderName}
                </p>
              </div>
              <span className="text-xs uppercase tracking-wider text-[#ffb580]">
                {project?.status || 'trial'}
              </span>
            </div>

            {project ? (
              <>
                <p className="text-sm text-white/80 mb-3">{project.goal}</p>
                <ul className="text-sm text-white/70 list-disc list-inside space-y-1 mb-3">
                  {project.deliverables.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <p className="text-xs text-white/50 mb-4">
                  Timeline: {project.timeline}
                  {project.deadlineAt
                    ? ` · Due ${new Date(project.deadlineAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                    : ''}
                </p>
              </>
            ) : null}

            {project?.rejectionNotes && project.rejectionNotes.length > 0 ? (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/20 p-3 mb-4">
                <p className="text-xs uppercase text-amber-200/80 mb-1">Founder feedback</p>
                <p className="text-sm text-white/80">
                  {project.rejectionNotes[project.rejectionNotes.length - 1]?.note}
                </p>
              </div>
            ) : null}

            {isSubmitted && project?.submission ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 p-3 text-sm text-white/80">
                Submitted — awaiting founder review.
                {project.submission.videoUrl ? (
                  <p className="mt-1">
                    <a href={project.submission.videoUrl} className="text-[#ffb580] hover:underline" target="_blank" rel="noreferrer">
                      Walkthrough video
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}

            {canSubmit ? (
              <div className="space-y-3 pt-3 border-t border-white/10">
                <input
                  value={getForm(trial.matchId).githubUrl}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      [trial.matchId]: { ...getForm(trial.matchId), githubUrl: e.target.value },
                    }))
                  }
                  placeholder="GitHub repo URL"
                  className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white"
                />
                <input
                  value={getForm(trial.matchId).videoUrl}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      [trial.matchId]: { ...getForm(trial.matchId), videoUrl: e.target.value },
                    }))
                  }
                  placeholder="Walkthrough video link (Google Drive)"
                  className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white"
                />
                <textarea
                  value={getForm(trial.matchId).notes}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      [trial.matchId]: { ...getForm(trial.matchId), notes: e.target.value },
                    }))
                  }
                  placeholder="Notes for the founder (optional)"
                  rows={2}
                  className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none"
                />
                <button
                  type="button"
                  disabled={busyId === trial.matchId}
                  onClick={() => submit(trial)}
                  className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold disabled:opacity-50"
                >
                  {busyId === trial.matchId ? 'Submitting…' : 'Submit trial'}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
