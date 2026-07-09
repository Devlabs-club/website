import React from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { BuilderHighlightsSection } from './BuilderHighlightsSection';
import type { BuilderProfileView } from './BuilderProfilePreview';

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

function hasEnrichmentData(profile: BuilderProfileView) {
  const highlights = (profile.founderHighlights || []).filter((item) => item?.title && item?.detail);
  const strengths = profile.profileQuality?.strengths || [];
  const sources = profile.enrichmentSources || [];
  const tech = profile.inferredTechStack || [];
  const projects = profile.insightProjects || profile.projects || [];
  return highlights.length > 0 || strengths.length > 0 || sources.length > 0 || tech.length > 0 || projects.length > 0;
}

export default function BuilderEnrichmentInsights({ profile }: { profile: BuilderProfileView }) {
  if (!hasEnrichmentData(profile)) {
    return (
      <section className="mb-6 border border-dashed border-black/12 bg-[#fffcfa] p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff5ef] text-[#ff7417]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-[#050505]">Proof-of-work research</p>
            <p className="mt-1 text-sm leading-6 text-black/50">
              After you save your links and resume, DevLabs scans GitHub, LinkedIn, Devpost, your portfolio, and the web to
              build founder-facing highlights. Re-save your profile to refresh this section.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const highlights = (profile.founderHighlights || []).filter((item) => item?.title && item?.detail);
  const strengths = profile.profileQuality?.strengths || [];
  const sources = profile.enrichmentSources || [];
  const inferredSkills = (profile.inferredTechStack || []).slice(0, 20);
  const editableSkills = new Set((profile.skills || []).map((skill) => skill.toLowerCase()));
  const discoveredOnlySkills = inferredSkills.filter((skill) => !editableSkills.has(skill.toLowerCase()));
  const projects = (profile.insightProjects || profile.projects || []).slice(0, 6);
  const additionalGithubProjects = profile.githubShowcase?.additionalProjectCount || 0;
  const reposScanned = profile.githubShowcase?.reposScanned || 0;
  const summary = profile.profileQuality?.oneLineSummary?.trim();

  return (
    <section className="mb-6 overflow-hidden border border-[#ff7417]/25 bg-gradient-to-br from-[#fff9f4] via-white to-[#fff5ef] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ff7417] text-white shadow-[0_8px_24px_rgba(255,116,23,0.28)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">What we found about you</p>
            <h3 className="mt-2 text-lg font-extrabold tracking-[-0.02em] text-[#050505]">
              This is the proof founders see when you show up in search
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
              Pulled from your links, resume, repos, and web research — not just what you typed. Founders use these signals to
              decide who to interview.
            </p>
          </div>
        </div>
        {profile.profileQuality?.label ? (
          <span className="rounded-full border border-[#ff7417]/30 bg-white px-3 py-1.5 text-xs font-extrabold text-[#bf4f08]">
            Profile · {profile.profileQuality.label}
          </span>
        ) : null}
      </div>

      {summary ? (
        <p className="mt-5 rounded-2xl border border-black/8 bg-white/80 px-4 py-3 text-sm font-semibold leading-6 text-[#050505]">
          {summary}
        </p>
      ) : null}

      {sources.length ? (
        <div className="mt-5">
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/35">Sources analyzed</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sources.map((entry) => (
              <span
                key={entry.source}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#ff7417]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#bf4f08]"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {sourceLabel(entry.source)}
                {entry.projectCount ? <span className="text-black/40">· {entry.projectCount} projects</span> : null}
              </span>
            ))}
            {reposScanned > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/55">
                {reposScanned} GitHub repos scanned
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {highlights.length ? (
        <div className="mt-6">
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/35">Founder highlights</p>
          <p className="mt-1 text-sm text-black/45">Tap a highlight to read the full proof point.</p>
          <div className="mt-3">
            <BuilderHighlightsSection highlights={highlights} defaultVisible={6} />
          </div>
        </div>
      ) : null}

      {strengths.length ? (
        <div className="mt-6">
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/35">Strength signals</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {strengths.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-2xl border border-black/8 bg-white/90 px-4 py-3">
                <p className="text-sm font-extrabold text-[#050505]">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-black/55">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {inferredSkills.length ? (
        <div className="mt-6">
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/35">Skills we inferred</p>
          <p className="mt-1 text-sm text-black/45">
            From repos, hackathons, resume, and experience{discoveredOnlySkills.length ? ' — including skills you did not type manually' : ''}.
          </p>
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
        </div>
      ) : null}

      {projects.length ? (
        <div className="mt-6">
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/35">Shipped work we surfaced</p>
          {additionalGithubProjects > 0 ? (
            <p className="mt-1 text-sm text-black/45">
              Top {projects.length} featured below
              {profile.totalProjectCount ? ` of ${profile.totalProjectCount} total projects` : ''}
              {additionalGithubProjects > 0 ? ` — plus ${additionalGithubProjects} more on GitHub` : ''}.
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <div key={project.id || project.projectName} className="rounded-2xl border border-black/8 bg-white/90 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-extrabold text-[#050505]">{project.projectName}</p>
                  {project.source ? (
                    <span className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/40">
                      {sourceLabel(project.source)}
                    </span>
                  ) : null}
                </div>
                {project.description ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-black/55">{project.description}</p>
                ) : null}
                {project.builderContribution ? (
                  <p className="mt-3 rounded-xl border border-[#ff7417]/20 bg-[#fff9f4] px-3 py-2 text-xs leading-5 text-black/60">
                    <span className="font-extrabold text-[#bf4f08]">Your contribution: </span>
                    {project.builderContribution}
                  </p>
                ) : null}
                {(project.techStack || []).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(project.techStack || []).slice(0, 8).map((skill) => (
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
        </div>
      ) : null}
    </section>
  );
}
