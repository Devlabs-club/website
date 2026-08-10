import React from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
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

export default function BuilderProfileProofPanel({ profile, embedded = false }: { profile: BuilderProfileView; embedded?: boolean }) {
  const shellClass = embedded ? 'flex min-h-0 flex-col' : `${profilePaneClass} h-full`;
  const bodyClass = embedded ? 'space-y-6' : `${profilePaneBodyClass} space-y-6`;

  if (!hasProofData(profile)) {
    return (
      <div className={shellClass}>
        <div className={profilePaneHeaderClass}>
          <p className="text-sm font-semibold text-black">Proof & research</p>
          <p className="mt-1 text-xs text-black/45">What founders see beyond your basic profile.</p>
        </div>
        <div className={embedded ? '' : `${profilePaneBodyClass} flex items-center`}>
          <div className="w-full border border-dashed border-[#e3ddd4] bg-[#fffcfa] p-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff5ef] text-[#ff7417]">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-extrabold text-[#050505]">Research not ready yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/50">
              After you save your links and resume, DevLabs checks GitHub, LinkedIn, Devpost, your portfolio, and the web.
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
  const topHighlights = highlights.slice(0, 3);
  const topStrengths = strengths.slice(0, 2);
  const topProjects = projects.slice(0, 3);

  return (
    <div className={shellClass}>
      <div className={profilePaneHeaderClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-black">Enrichment summary</p>
            <p className="mt-1 text-xs text-black/45">
              Quick check of what got pulled in. Full fields are editable on the right.
            </p>
          </div>
          {profile.profileQuality?.label ? (
            <span className="rounded-full border border-[#ff7417]/30 bg-[#fff5ef] px-3 py-1.5 text-xs font-extrabold text-[#bf4f08]">
              {profile.profileQuality.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className={bodyClass}>
        {sources.length ? (
          <section className="border border-black/8 bg-[#fffcfa] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={profileSectionLabelClass}>Sources</p>
                <p className="mt-1 text-sm text-black/45">
                  {sources.length} checked{reposScanned > 0 ? ` · ${reposScanned} GitHub repos scanned` : ''}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#ff7417]" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {sources.slice(0, 6).map((entry) => (
                <div key={entry.source} className="flex items-center justify-between gap-2 border border-black/8 bg-white px-3 py-2 text-sm">
                  <span className="font-semibold text-black/70">{sourceLabel(entry.source)}</span>
                  {entry.projectCount ? <span className="text-xs font-bold text-black/35">{entry.projectCount}</span> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {topHighlights.length ? (
          <section>
            <p className={profileSectionLabelClass}>Highlights</p>
            <div className="mt-3 space-y-2">
              {topHighlights.map((item, index) => (
                <div key={`${item.title}-${index}`} className="border border-black/8 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-extrabold text-[#050505]">{item.title}</p>
                    {item.source ? (
                      <span className="shrink-0 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-black/30">
                        {sourceLabel(item.source)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-black/55 line-clamp-2">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {topStrengths.length ? (
          <section>
            <p className={profileSectionLabelClass}>Signals</p>
            <div className="mt-3 grid gap-3">
              {topStrengths.map((item, index) => (
                <div key={`${item.title}-${index}`} className="border border-black/8 bg-[#fffcfa] px-4 py-3">
                  <p className="text-sm font-extrabold text-[#050505]">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-black/55">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {topProjects.length ? (
          <section>
            <p className={profileSectionLabelClass}>Shipped work</p>
            {additionalGithubProjects > 0 ? (
              <p className="mt-1 text-sm text-black/45">
                Top {topProjects.length} featured
                {profile.totalProjectCount ? ` of ${profile.totalProjectCount} total` : ''}
                {additionalGithubProjects > 0 ? ` · ${additionalGithubProjects} more on GitHub` : ''}
              </p>
            ) : null}
            <div className="mt-3 grid gap-3">
              {topProjects.map((project) => (
                <div key={project.id || project.projectName} className="border border-black/8 bg-[#fffcfa] p-4">
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
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {inferredSkills.length ? (
          <section>
            <p className={profileSectionLabelClass}>Inferred skills</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {inferredSkills.slice(0, 12).map((skill) => (
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
