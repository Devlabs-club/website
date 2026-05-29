import React from 'react';
import type { FullCandidate } from './founderTypes';

function verificationTone(label: string) {
  if (label === 'DevLabs Verified') return 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10';
  if (label === 'Founder Verified') return 'text-blue-200 border-blue-400/30 bg-blue-500/10';
  if (label === 'Builder Claimed' || label === 'Peer Confirmed') {
    return 'text-amber-200 border-amber-400/30 bg-amber-500/10';
  }
  return 'text-white/60 border-white/20 bg-white/10';
}

function matchLabelTone(label: string) {
  if (label === 'Strong Match') return 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10';
  if (label === 'Good Match') return 'text-amber-200 border-amber-400/30 bg-amber-500/10';
  return 'text-white/80 border-white/20 bg-white/10';
}

export default function FounderCandidateCard({
  candidate,
  unlocked,
  onViewDetails,
  onRequestIntro,
  onSave,
  onHide,
  onAskAgent,
  actionBusy,
}: {
  candidate: FullCandidate;
  unlocked: boolean;
  onViewDetails: () => void;
  onRequestIntro?: () => void;
  onSave?: () => void;
  onHide?: () => void;
  onAskAgent?: () => void;
  actionBusy?: boolean;
}) {
  if (!unlocked) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-white truncate">{candidate.name}</h4>
          <p className="text-sm text-[#fa7d22] mt-0.5 truncate">{candidate.headline || 'Builder'}</p>
          {candidate.location ? <p className="text-xs text-white/50 mt-1">{candidate.location}</p> : null}
        </div>
        <div className="shrink-0 text-right space-y-1">
          <span className={`block px-2.5 py-1 rounded-full text-xs border ${matchLabelTone(candidate.matchLabel)}`}>
            Match: {candidate.matchLabel}
          </span>
          <span className="block text-[10px] text-white/45 uppercase tracking-wider">Best fit</span>
          <span className="block text-xs text-white/70 max-w-[140px]">
            {candidate.topSkills.slice(0, 2).join(' · ') || candidate.headline || '—'}
          </span>
        </div>
      </div>

      {candidate.whyTheyMatch ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-wider text-white/45 mb-1">Why they match</p>
          <p className="text-sm text-white/85">{candidate.whyTheyMatch}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <span className={`px-2 py-0.5 rounded text-[10px] border ${verificationTone(candidate.builderVerificationLabel)}`}>
          {candidate.builderVerificationLabel}
        </span>
        {candidate.founderClarityLabel ? (
          <span className="px-2 py-0.5 rounded text-[10px] border border-white/15 text-white/60">
            Clarity: {candidate.founderClarityLabel}
          </span>
        ) : null}
        <span className="px-2 py-0.5 rounded text-[10px] border border-white/15 text-white/60">
          {candidate.proofStrengthLabel}
        </span>
      </div>

      {candidate.bio ? (
        <p className="text-sm text-white/75 line-clamp-3">{candidate.bio}</p>
      ) : null}

      <div className="text-sm text-white/70">
        <span className="text-white/45 text-xs uppercase tracking-wider">Availability · </span>
        {candidate.availability.availableNow ? 'Available now' : 'Limited availability'}
        {candidate.availability.hoursPerWeek ? ` · ${candidate.availability.hoursPerWeek} hrs/week` : ''}
      </div>

      {candidate.workTypes.length > 0 ? (
        <p className="text-xs text-white/55">
          Open to: {candidate.workTypes.map((w) => w.replace(/_/g, ' ')).join(', ')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {candidate.topSkills.slice(0, 6).map((skill) => (
          <span key={skill} className="px-2 py-0.5 rounded-md text-xs bg-white/10 text-white/75">
            {skill}
          </span>
        ))}
      </div>

      {candidate.projects.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-white/45">Relevant proof</p>
          {candidate.projects.slice(0, 2).map((project) => (
            <div key={project._id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-white">{project.projectName}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${verificationTone(project.verificationLabel)}`}>
                  {project.verificationLabel}
                </span>
              </div>
              {project.description ? (
                <p className="text-xs text-white/60 line-clamp-2">{project.description}</p>
              ) : null}
              {project.builderContribution ? (
                <p className="text-xs text-white/70 mt-1 line-clamp-2">{project.builderContribution}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs">
        {candidate.links.github ? (
          <a href={candidate.links.github} target="_blank" rel="noreferrer" className="text-[#fa7d22] hover:underline">
            GitHub
          </a>
        ) : null}
        {candidate.links.devpost ? (
          <a href={candidate.links.devpost} target="_blank" rel="noreferrer" className="text-[#fa7d22] hover:underline">
            Devpost
          </a>
        ) : null}
        {candidate.links.portfolio ? (
          <a href={candidate.links.portfolio} target="_blank" rel="noreferrer" className="text-[#fa7d22] hover:underline">
            Portfolio
          </a>
        ) : null}
        {candidate.links.linkedin ? (
          <a href={candidate.links.linkedin} target="_blank" rel="noreferrer" className="text-[#fa7d22] hover:underline">
            LinkedIn
          </a>
        ) : null}
        {candidate.links.resume ? (
          <a href={candidate.links.resume} target="_blank" rel="noreferrer" className="text-[#fa7d22] hover:underline">
            Resume
          </a>
        ) : null}
      </div>

      {candidate.riskFlags.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wider text-white/45 mb-1">Risks</p>
          <ul className="text-xs text-amber-200/90 space-y-0.5">
            {candidate.riskFlags.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-white/50 italic">{candidate.recommendedNextStep}</p>

      <div className="flex flex-wrap gap-2 mt-auto pt-2">
        <button
          type="button"
          onClick={onViewDetails}
          className="px-3 py-1.5 rounded-lg border border-white/20 text-white text-xs hover:bg-white/10"
        >
          View details
        </button>
        <button
          type="button"
          disabled={actionBusy || candidate.introRequested}
          onClick={onRequestIntro}
          className="px-3 py-1.5 rounded-lg bg-[#fa7d22] text-black text-xs font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
        >
          {candidate.introRequested ? 'Intro requested' : 'Request intro'}
        </button>
        <button
          type="button"
          disabled={actionBusy}
          onClick={onSave}
          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/80 text-xs hover:bg-white/5 disabled:opacity-50"
        >
          {candidate.saved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          disabled={actionBusy}
          onClick={onHide}
          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/50 text-xs hover:bg-white/5 disabled:opacity-50"
        >
          Hide
        </button>
        <button
          type="button"
          disabled={actionBusy}
          onClick={onAskAgent}
          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-xs hover:bg-white/5 disabled:opacity-50"
        >
          Ask Agent
        </button>
      </div>
    </div>
  );
}
