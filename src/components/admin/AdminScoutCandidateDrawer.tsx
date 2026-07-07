import React from 'react';
import { X, ExternalLink, Mail, Github, Linkedin } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminCandidate } from './adminScoutUtils';

export default function AdminScoutCandidateDrawer({
  candidate,
  onClose,
}: {
  candidate: AdminCandidate | null;
  onClose: () => void;
}) {
  if (!candidate) return null;

  return (
    <Sheet open={Boolean(candidate)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-[#0c0c0e] border-white/10 text-white overflow-y-auto"
      >
        <SheetHeader className="text-left space-y-1">
          <SheetTitle className="text-white text-xl">{candidate.name}</SheetTitle>
          {candidate.headline ? (
            <p className="text-sm text-white/55">{candidate.headline}</p>
          ) : null}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full border border-[#fa7d22]/30 bg-[#fa7d22]/10 text-[#fa7d22]">
              {candidate.matchLabel} · {candidate.matchScore}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/60">
              {candidate.proofStrengthLabel}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/60">
              {candidate.builderVerificationLabel}
            </span>
          </div>

          {candidate.email ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Email</p>
              <a
                href={`mailto:${candidate.email}`}
                className="text-sm text-[#fa7d22] hover:underline flex items-center gap-2"
              >
                <Mail className="w-3.5 h-3.5" />
                {candidate.email}
              </a>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {candidate.location ? (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40">Location</p>
                <p className="text-white/80">{candidate.location}</p>
              </div>
            ) : null}
            {candidate.universityOrCompany ? (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40">School / Company</p>
                <p className="text-white/80">{candidate.universityOrCompany}</p>
              </div>
            ) : null}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">Availability</p>
              <p className="text-white/80">
                {candidate.availability.availableNow ? 'Available now' : 'Not marked available'}
              </p>
            </div>
          </div>

          {candidate.whyTheyMatch ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Why they match</p>
              <p className="text-sm text-white/75 leading-relaxed">{candidate.whyTheyMatch}</p>
            </div>
          ) : null}

          {candidate.topSkills.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.topSkills.map((skill) => (
                  <span
                    key={skill}
                    className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/70"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {candidate.riskFlags.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Risks</p>
              <ul className="text-sm text-amber-400/90 space-y-1">
                {candidate.riskFlags.map((flag) => (
                  <li key={flag}>· {flag}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {candidate.links.github ? (
              <a
                href={candidate.links.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 text-white/70 hover:text-white"
              >
                <Github className="w-3.5 h-3.5" /> GitHub
              </a>
            ) : null}
            {candidate.links.linkedin ? (
              <a
                href={candidate.links.linkedin}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 text-white/70 hover:text-white"
              >
                <Linkedin className="w-3.5 h-3.5" /> LinkedIn
              </a>
            ) : null}
            {candidate.links.portfolio ? (
              <a
                href={candidate.links.portfolio}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 text-white/70 hover:text-white"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Portfolio
              </a>
            ) : null}
          </div>

          {candidate.projects.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Projects</p>
              <div className="space-y-3">
                {candidate.projects.map((project) => (
                  <div
                    key={project._id}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white">{project.projectName}</p>
                      <span className="text-[10px] text-white/40 shrink-0">
                        {project.verificationLabel}
                      </span>
                    </div>
                    {project.builderContribution ? (
                      <p className="text-xs text-white/55 mt-2">{project.builderContribution}</p>
                    ) : null}
                    {project.techStack.length > 0 ? (
                      <p className="text-xs text-white/40 mt-2">{project.techStack.join(' · ')}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {candidate.signalScores ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Match signals</p>
              <pre className="text-[11px] text-white/50 bg-black/40 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(candidate.signalScores, null, 2)}
              </pre>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20"
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
