import React from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { BuilderHighlightsSection } from './BuilderHighlightsSection';
import type { BuilderProfileView } from './BuilderProfilePreview';
import { profilePaneBodyClass, profilePaneClass, profilePaneHeaderClass, profileSectionLabelClass } from './builderProfileLayout';

const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  devpost: 'Devpost',
  portfolio: 'Portfolio',
  personalwebsite: 'Website',
  twitter: 'X',
  resume: 'Resume',
  research: 'Web research',
};

function sourceLabel(source: string) {
  const key = source.trim().toLowerCase().replace(/\s+/g, '');
  return SOURCE_LABELS[key] || source;
}

function hasProofData(profile: BuilderProfileView) {
  const highlights = (profile.founderHighlights || []).filter((item) => item?.title && item?.detail);
  const strengths = profile.profileQuality?.strengths || [];
  const sources = profile.enrichmentSources || [];
  const tech = profile.inferredTechStack || [];
  const projects = profile.insightProjects || profile.projects || [];
  return (
    highlights.length > 0 ||
    strengths.length > 0 ||
    sources.length > 0 ||
    tech.length > 0 ||
    projects.length > 0 ||
    Boolean(profile.profileQuality?.oneLineSummary?.trim())
  );
}

export default function BuilderProfileProofPanel({ profile }: { profile: BuilderProfileView }) {
  if (!hasProofData(profile)) {
    return (
      <div className={`${profilePaneClass} h-full`}>
        <div className={profilePaneHeaderClass}>
          <p className="text-sm font-semibold text-black">Proof & research</p>
          <p className="mt-1 text-xs text-black/45">What founders see beyond your basic profile.</p>
        </div>
        <div className={`${profilePaneBodyClass} flex items-center`}>
          <div className="w-full rounded-2xl border border-dashed border-[#e3ddd4] bg-[#fffcfa] p-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff5ef] text-[#ff7417]">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-extrabold text-[#050505]">Research not ready yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/50">
              After you save your links and resume, DevLabs scans GitHub, LinkedIn, Devpost, your portfolio, and the web to
              build founder-facing highlights.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const highlights = (profile.founderHighlights || []).filter((item) => item?.title && item?.detail);
  const strengths = profile.profileQuality?.strengths || [];
  const sources = profile.enrichmentSources || [];
  const inferredSkills = (profile.inferredTechStack || []).slice(0, 20);
  const editableSkills = new Set((profile.skills || []).map((skill) => skill.toLowerCase()));
  const projects = (profile.insightProjects || profile.projects || []).slice(0, 8);
  const additionalGithubProjects = profile.githubShowcase?.additionalProjectCount || 0;
  const reposScanned = profile.githubShowcase?.reposScanned || 0;
  const summary = profile.profileQuality?.oneLineSummary?.trim();

  return (
    <div className={`${profilePaneClass} h-full`}>
      <div className={profilePaneHeaderClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-black">Proof & research</p>
            <p className="mt-1 text-xs text-black/45">
              Deep research highlights, shipped work, and why founders shortlist builders like you.
            </p>
          </div>
          {profile.profileQuality?.label ? (
            <span className="rounded-full border border-[#ff7417]/30 bg-[#fff5ef] px-3 py-1.5 text-xs font-extrabold text-[#bf4f08]">
              {profile.profileQuality.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className={`${profilePaneBodyClass} space-y-8`}>
        {summary ? (
          <section>
            <p className={profileSectionLabelClass}>Why a founder would like you</p>
            <p className="mt-3 rounded-2xl border border-[#ff7417]/20 bg-gradient-to-br from-[#fff9f4] to-white px-4 py-4 text-sm font-semibold leading-7 text-[#050505]">
              {summary}
            </p>
          </section>
        ) : null}

        {sources.length ? (
          <section>
            <p className={profileSectionLabelClass}>Sources analyzed</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.map((entry) => (
                <span
                  key={entry.source}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#ff7417]/25 bg-[#fff9f4] px-3 py-1.5 text-xs font-semibold text-[#bf4f08]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {sourceLabel(entry.source)}
                  {entry.projectCount ? <span className="text-black/40">· {entry.projectCount}</span> : null}
                </span>
              ))}
              {reposScanned > 0 ? (
                <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/55">
                  {reposScanned} GitHub repos scanned
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        {highlights.length ? (
          <section>
            <p className={profileSectionLabelClass}>Deep research highlights</p>
            <p className="mt-1 text-sm text-black/45">Tap a highlight to read the full proof point.</p>
            <div className="mt-3">
              <BuilderHighlightsSection highlights={highlights} defaultVisible={8} />
            </div>
          </section>
        ) : null}

        {strengths.length ? (
          <section>
            <p className={profileSectionLabelClass}>Strength signals</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {strengths.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-2xl border border-black/8 bg-[#fffcfa] px-4 py-3">
                  <p className="text-sm font-extrabold text-[#050505]">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-black/55">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {projects.length ? (
          <section>
            <p className={profileSectionLabelClass}>Shipped work</p>
            {additionalGithubProjects > 0 ? (
              <p className="mt-1 text-sm text-black/45">
                Top {projects.length} featured
                {profile.totalProjectCount ? ` of ${profile.totalProjectCount} total` : ''}
                {additionalGithubProjects > 0 ? ` · ${additionalGithubProjects} more on GitHub` : ''}
              </p>
            ) : null}
            <div className="mt-3 grid gap-3">
              {projects.map((project) => (
                <div key={project.id || project.projectName} className="rounded-2xl border border-black/8 bg-[#fffcfa] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-extrabold text-[#050505]">{project.projectName}</p>
                    {project.source ? (
                      <span className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/40">
                        {sourceLabel(project.source)}
                      </span>
                    ) : null}
                  </div>
                  {project.description ? (
                    <p className="mt-2 text-sm leading-6 text-black/55">{project.description}</p>
                  ) : null}
                  {project.builderContribution ? (
                    <p className="mt-3 rounded-xl border border-[#ff7417]/20 bg-[#fff9f4] px-3 py-2 text-xs leading-5 text-black/60">
                      <span className="font-extrabold text-[#bf4f08]">Contribution: </span>
                      {project.builderContribution}
                    </p>
                  ) : null}
                  {(project.techStack || []).length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(project.techStack || []).slice(0, 10).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-[#ff7417]/25 bg-[#fff7ef] px-2.5 py-1 text-[11px] font-semibold text-[#a85a0f]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {inferredSkills.length ? (
          <section>
            <p className={profileSectionLabelClass}>Inferred skills</p>
            <p className="mt-1 text-sm text-black/45">From repos, hackathons, resume, and experience.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {inferredSkills.map((skill) => (
                <span
                  key={skill}
                  className={
                    editableSkills.has(skill.toLowerCase())
                      ? 'rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/65'
                      : 'rounded-full border border-[#ff7417]/30 bg-[#fff7ef] px-3 py-1.5 text-xs font-semibold text-[#a85a0f]'
                  }
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
