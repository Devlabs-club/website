import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X, ThumbsDown, Bookmark } from 'lucide-react';
import type { FullCandidate } from './founderTypes';
import FounderTrialProjectCard from './FounderTrialProjectCard';
import {
  canConfirmCallTime,
  canShowPostMeetingActions,
  getIntroButtonLabel,
  getScheduleMeetButtonState,
} from '@/lib/talent/founderIntroUi';
import { pipelineNeedsCallClockTick } from '@/lib/talent/callTiming';

const REJECTION_REASONS = [
  { id: 'wrong_skills', label: 'Wrong skill set' },
  { id: 'weak_proof', label: 'Weak proof' },
  { id: 'unclear_contribution', label: 'Unclear contribution' },
  { id: 'weak_backend', label: 'Not enough backend depth' },
  { id: 'weak_frontend', label: 'Not enough frontend/design quality' },
  { id: 'availability_mismatch', label: 'Availability mismatch' },
  { id: 'too_junior', label: 'Too junior' },
];

const SAVE_REASONS = [
  { id: 'strong_project', label: 'Strong relevant project' },
  { id: 'strong_stack', label: 'Strong technical stack' },
  { id: 'clear_contribution', label: 'Clear personal contribution' },
  { id: 'startup_experience', label: 'Strong startup experience' },
  { id: 'good_availability', label: 'Good availability' },
];

function FeedbackModal({
  mode,
  candidateName,
  onSubmit,
  onCancel,
  busy,
}: {
  mode: 'save' | 'reject';
  candidateName: string;
  onSubmit: (reasonCategory: string, reasonText: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [customText, setCustomText] = useState('');
  const reasons = mode === 'reject' ? REJECTION_REASONS : SAVE_REASONS;
  const title = mode === 'reject' ? `Why are you passing on ${candidateName}?` : `What stood out about ${candidateName}?`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111114] p-5 space-y-4">
        <div className="flex items-start justify-between">
          <p className="text-sm font-semibold text-white">{title}</p>
          <button type="button" onClick={onCancel} className="text-white/40 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          {reasons.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r.id)}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-all ${
                selected === r.id
                  ? 'border-[#fa7d22]/50 bg-[#fa7d22]/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/20'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected('other')}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-all ${
              selected === 'other'
                ? 'border-[#fa7d22]/50 bg-[#fa7d22]/10 text-white'
                : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/20'
            }`}
          >
            Something else
          </button>
          {selected === 'other' ? (
            <textarea
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] text-white text-sm px-3 py-2 resize-none focus:outline-none focus:border-white/20 placeholder-white/30"
              placeholder="Briefly describe the issue…"
              rows={2}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
          ) : null}
        </div>
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => onSubmit(selected, selected === 'other' ? customText : reasons.find(r => r.id === selected)?.label || selected)}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 ${
            mode === 'reject'
              ? 'bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30'
              : 'bg-[#fa7d22] text-black hover:bg-[#ffb580]'
          }`}
        >
          {busy ? 'Saving…' : mode === 'reject' ? 'Confirm pass' : 'Save candidate'}
        </button>
      </div>
    </div>
  );
}

function verificationTone(label: string) {
  if (label === 'DevLabs Verified') return 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10';
  if (label === 'Founder Verified') return 'text-blue-200 border-blue-400/30 bg-blue-500/10';
  if (label === 'Builder Claimed' || label === 'Peer Confirmed') {
    return 'text-amber-200 border-amber-400/30 bg-amber-500/10';
  }
  return 'text-white/60 border-white/20 bg-white/10';
}

export default function FounderCandidateDrawer({
  candidate,
  opportunityId,
  pipelineEntry,
  onClose,
  onRequestIntro,
  onTrialSaved,
  onScheduleCall,
  onConfirmCall,
  onHire,
  onReviewTrial,
  onSave,
  onReject,
  actionBusy,
}: {
  candidate: FullCandidate;
  opportunityId: string;
  pipelineEntry?: {
    callScheduleStatus?: string | null;
    callScheduleId?: string | null;
    callCompletedAt?: string | null;
    confirmedCallEndAt?: string | null;
    trialProjectStatus?: string | null;
    introRequestStatus?: string | null;
    status?: string;
  } | null;
  onClose: () => void;
  onRequestIntro: () => void;
  onTrialSaved: () => void;
  onScheduleCall: (pendingConfirm?: boolean) => void;
  onConfirmCall: () => void;
  onHire: (skipTrial?: boolean) => void;
  onReviewTrial: () => void;
  onSave?: (reasonCategory: string, reasonText: string) => Promise<void>;
  onReject?: (reasonCategory: string, reasonText: string) => Promise<void>;
  actionBusy?: boolean;
}) {
  const [callClockTick, setCallClockTick] = useState(0);
  const [feedbackMode, setFeedbackMode] = useState<'save' | 'reject' | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  useEffect(() => {
    if (!pipelineEntry || !pipelineNeedsCallClockTick([pipelineEntry])) return;
    const id = window.setInterval(() => setCallClockTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [pipelineEntry]);

  const matchStatus = candidate.matchStatus;
  const introButton = getIntroButtonLabel(candidate, pipelineEntry as any);
  const scheduleMeet = getScheduleMeetButtonState(candidate, pipelineEntry as any);
  const showConfirmTime = canConfirmCallTime(pipelineEntry as any);
  const postMeeting = canShowPostMeetingActions(pipelineEntry as any, candidate);
  const showReviewTrial = candidate.trialProject?.status === 'submitted';
  void callClockTick;

  const handleFeedbackSubmit = async (reasonCategory: string, reasonText: string) => {
    if (!feedbackMode) return;
    setFeedbackBusy(true);
    try {
      if (feedbackMode === 'save' && onSave) await onSave(reasonCategory, reasonText);
      if (feedbackMode === 'reject' && onReject) await onReject(reasonCategory, reasonText);
      setFeedbackMode(null);
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <>
    {feedbackMode ? (
      <FeedbackModal
        mode={feedbackMode}
        candidateName={candidate.name}
        onSubmit={handleFeedbackSubmit}
        onCancel={() => setFeedbackMode(null)}
        busy={feedbackBusy}
      />
    ) : null}
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg glass-panel-strong border-white/10 bg-[#0c0d0f]/95 p-0 overflow-y-auto">
        <SheetHeader className="sticky top-0 z-10 px-6 py-4 border-b border-white/10 bg-[#0c0d0f]/95 text-left">
          <SheetTitle className="text-xl text-white">{candidate.name}</SheetTitle>
          <p className="text-sm text-[#fa7d22]">{candidate.headline || candidate.anonymousLabel}</p>
        </SheetHeader>

        <div className="p-6 space-y-8">
          <section>
            <h3 className="text-xs uppercase tracking-wider text-white/45 mb-3">Summary</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`px-2 py-1 rounded-full text-xs border ${verificationTone(candidate.builderVerificationLabel)}`}>
                {candidate.builderVerificationLabel}
              </span>
              {candidate.founderClarityLabel ? (
                <span className="px-2 py-1 rounded-full text-xs border border-white/15 bg-white/5 text-white/70">
                  Founder clarity: {candidate.founderClarityLabel}
                </span>
              ) : null}
              <span className="px-2 py-1 rounded-full text-xs border border-white/15 bg-white/5 text-white/70">
                {candidate.proofStrengthLabel}
              </span>
              <span className="px-2 py-1 rounded-full text-xs border border-[#fa7d22]/30 text-[#ffb580]">
                {candidate.matchLabel}
              </span>
            </div>
            {candidate.bio ? <p className="text-sm text-white/80 leading-relaxed">{candidate.bio}</p> : null}
            {candidate.location ? <p className="text-sm text-white/55 mt-2">{candidate.location}</p> : null}
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-white/45 mb-3">Why they match</h3>
            <p className="text-sm text-white/80 leading-relaxed">{candidate.whyTheyMatch}</p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-white/45 mb-3">Proof-of-work</h3>
            <div className="space-y-4">
              {candidate.projects.length === 0 ? (
                <p className="text-sm text-white/50">No projects on profile yet.</p>
              ) : (
                candidate.projects.map((project) => (
                  <div key={project._id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex justify-between gap-2 mb-2">
                      <h4 className="font-medium text-white text-sm">{project.projectName}</h4>
                      <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] border ${verificationTone(project.verificationLabel)}`}>
                        {project.verificationLabel}
                      </span>
                    </div>
                    {project.description ? (
                      <p className="text-xs text-white/65 mb-2">{project.description}</p>
                    ) : null}
                    {project.builderContribution ? (
                      <p className="text-xs text-white/80">
                        <span className="text-white/45">Contribution: </span>
                        {project.builderContribution}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {project.links.github ? (
                        <a href={project.links.github} target="_blank" rel="noreferrer" className="text-xs text-[#fa7d22] hover:underline">
                          GitHub
                        </a>
                      ) : null}
                      {project.links.devpost ? (
                        <a href={project.links.devpost} target="_blank" rel="noreferrer" className="text-xs text-[#fa7d22] hover:underline">
                          Devpost
                        </a>
                      ) : null}
                      {project.links.demo ? (
                        <a href={project.links.demo} target="_blank" rel="noreferrer" className="text-xs text-[#fa7d22] hover:underline">
                          Demo
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-white/45 mb-3">Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {candidate.topSkills.map((skill) => (
                <span key={skill} className="px-2 py-1 rounded-md text-xs bg-white/10 text-white/80">
                  {skill}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-white/45 mb-3">Availability</h3>
            <p className="text-sm text-white/80">
              {candidate.availability.availableNow ? 'Available now' : 'Not marked available'}
              {candidate.availability.hoursPerWeek ? ` · ${candidate.availability.hoursPerWeek} hrs/week` : ''}
              {candidate.availability.remotePreference
                ? ` · ${String(candidate.availability.remotePreference).replace('_', ' ')}`
                : ''}
            </p>
            {candidate.workTypes.length > 0 ? (
              <p className="text-sm text-white/60 mt-2">
                Open to: {candidate.workTypes.map((w) => w.replace(/_/g, ' ')).join(', ')}
              </p>
            ) : null}
          </section>

          {candidate.riskFlags.length > 0 ? (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-amber-200/80 mb-3">Risks</h3>
              <ul className="text-sm text-white/70 space-y-1">
                {candidate.riskFlags.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs uppercase tracking-wider text-white/45 mb-3">Suggested interview questions</h3>
            <ul className="text-sm text-white/75 space-y-2 list-disc list-inside">
              {candidate.suggestedInterviewQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </section>

          {postMeeting ? (
            <FounderTrialProjectCard
              opportunityId={opportunityId}
              builderId={candidate.builderId}
              initialProject={candidate.trialProject}
              onSaved={onTrialSaved}
              callCompleted={postMeeting}
            />
          ) : null}
        </div>

        <div className="sticky bottom-0 border-t border-white/10 bg-[#0c0d0f]/95 backdrop-blur px-6 py-4 flex flex-wrap gap-2">
          {scheduleMeet.show && !scheduleMeet.disabled ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onScheduleCall(false)}
              className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold disabled:opacity-50"
            >
              {scheduleMeet.label}
            </button>
          ) : null}
          {scheduleMeet.show && scheduleMeet.disabled ? (
            <button
              type="button"
              disabled
              className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl border border-white/15 text-white/45 text-sm font-semibold cursor-not-allowed"
            >
              {scheduleMeet.label}
            </button>
          ) : null}
          {showConfirmTime ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={onConfirmCall}
              className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold disabled:opacity-50"
            >
              Confirm proposed time
            </button>
          ) : null}
          {postMeeting && matchStatus !== 'hired' ? (
            <>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => onHire(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black text-sm font-semibold disabled:opacity-50"
              >
                Hire now
              </button>
              {showReviewTrial ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={onReviewTrial}
                  className="px-4 py-2.5 rounded-xl border border-[#fa7d22]/40 text-[#ffb580] text-sm font-semibold disabled:opacity-50"
                >
                  Review submission
                </button>
              ) : null}
            </>
          ) : null}
          {introButton.show ? (
            <button
              type="button"
              disabled={actionBusy || introButton.disabled}
              onClick={onRequestIntro}
              className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl border border-[#fa7d22]/40 text-[#ffb580] text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {introButton.label}
            </button>
          ) : null}
          {/* Save / Reject feedback buttons */}
          {(onSave || onReject) && candidate.matchStatus !== 'hired' ? (
            <div className="w-full flex gap-2 pt-1 border-t border-white/[0.06]">
              {onSave ? (
                <button
                  type="button"
                  disabled={actionBusy || feedbackBusy}
                  onClick={() => setFeedbackMode('save')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white/60 text-xs hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Save
                </button>
              ) : null}
              {onReject ? (
                <button
                  type="button"
                  disabled={actionBusy || feedbackBusy}
                  onClick={() => setFeedbackMode('reject')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white/60 text-xs hover:text-red-400 hover:border-red-500/20 transition-all disabled:opacity-40"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  Pass
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
