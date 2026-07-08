import React from "react";
import { ExternalLink } from "lucide-react";
import { BuilderHighlightsSection } from "./BuilderHighlightsSection";

export type BuilderProfileView = {
  id?: string;
  name?: string;
  email?: string | null;
  headline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  universityOrCompany?: string | null;
  rolePreference?: string[];
  skills?: string[];
  preferredWorkType?: string[];
  experiences?: Array<{ title: string; company: string; dateRange?: string; description?: string; skills?: string[] }>;
  projects?: Array<{
    id?: string;
    projectName: string;
    description?: string | null;
    problemSolved?: string | null;
    builderContribution?: string | null;
    techStack?: string[];
    links?: Record<string, string | null>;
    source?: string;
    sourceId?: string | null;
  }>;
  links?: Record<string, string | null>;
  verificationStatus?: string;
  founderHighlights?: Array<{ title?: string; detail?: string; source?: string }>;
  githubShowcase?: { featuredCount?: number; additionalProjectCount?: number; reposScanned?: number };
};

const linkLabel = (key: string) => {
  const labels: Record<string, string> = {
    github: "GitHub",
    linkedin: "LinkedIn",
    devpost: "Devpost",
    portfolio: "Portfolio",
    personalWebsite: "Website",
    twitter: "X",
    resume: "Resume",
  };
  return labels[key] || key;
};

export const BuilderProfilePreview: React.FC<{ profile: BuilderProfileView; showHighlights?: boolean }> = ({
  profile,
  showHighlights = true,
}) => {
  const skills = [...new Set([...(profile.skills || []), ...(profile.preferredWorkType || [])])].slice(0, 16);
  const experiences = (profile.experiences || []).slice(0, 5);
  const projects = (profile.projects || []).slice(0, 3);
  const linkEntries = Object.entries(profile.links || {}).filter(([, href]) => Boolean(href));
  const additionalGithubProjects = profile.githubShowcase?.additionalProjectCount || 0;
  const reposScanned = profile.githubShowcase?.reposScanned || 0;
  const highlights = (profile.founderHighlights || []).filter((item) => item?.title && item?.detail).slice(0, 6);

  const githubShowcaseNote =
    additionalGithubProjects > 0 ? (
      <p className="text-sm leading-6 text-black/50">
        Skills span {reposScanned > 0 ? `${reposScanned} scanned repos` : "multiple repos"} — top 3 featured below, plus{" "}
        <strong className="font-extrabold text-[#bf4f08]">{additionalGithubProjects} more shipped GitHub projects</strong>.
      </p>
    ) : null;

  return (
    <div className="builder-profile-preview font-manrope mx-auto w-full max-w-3xl">
      <header className="border-b border-black/10 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-5">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name || "Builder"}
                className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-black/10"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#fff5ef] text-2xl font-extrabold text-[#ff7417] ring-1 ring-[#ff7417]/20">
                {(profile.name || "B").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 pt-0.5">
              <h2 className="truncate text-[clamp(1.35rem,2.8vw,2rem)] font-extrabold tracking-tight text-[#050505]">
                {profile.name || "Builder"}
              </h2>
              {profile.headline ? (
                <p className="mt-2 text-base font-semibold leading-relaxed text-[#050505]/85">{profile.headline}</p>
              ) : null}
              {(profile.location || profile.universityOrCompany) ? (
                <p className="mt-2 text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/40">
                  {[profile.location, profile.universityOrCompany].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
          {linkEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {linkEntries.map(([key, href]) => (
                <a
                  key={key}
                  href={href!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-black/70 transition hover:border-[#ff7417]/40 hover:bg-[#fff5ef]"
                >
                  {linkLabel(key)} <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {profile.bio && profile.bio !== profile.headline ? (
          <p className="mt-6 max-w-2xl text-sm leading-7 text-black/60">{profile.bio}</p>
        ) : null}
      </header>

      {showHighlights && highlights.length > 0 ? (
        <PreviewSection label="Why this builder stands out">
          <BuilderHighlightsSection highlights={highlights} defaultVisible={4} />
        </PreviewSection>
      ) : null}

      <PreviewSection label="Skills">
        {skills.length ? (
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-black/10 bg-[#fbf6f3]/86 px-3 py-1.5 text-xs font-semibold text-black/65"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-black/45">No skills added yet.</p>
        )}
        {githubShowcaseNote ? <div className="mt-4">{githubShowcaseNote}</div> : null}
      </PreviewSection>

      {(profile.rolePreference?.length ?? 0) > 0 ? (
        <PreviewSection label="Open to">
          <div className="flex flex-wrap gap-2">
            {profile.rolePreference!.slice(0, 6).map((role) => (
              <span
                key={role}
                className="rounded-full border border-[#ff7417]/35 bg-[#fff5ef] px-3 py-1.5 text-xs font-semibold text-[#bf4f08]"
              >
                {role}
              </span>
            ))}
          </div>
        </PreviewSection>
      ) : null}

      <PreviewSection label="Experience">
        {experiences.length ? (
          <div className="space-y-3">
            {experiences.map((exp, index) => (
              <div key={`${exp.company}-${index}`} className="rounded-2xl border border-black/8 bg-[#fffcfa] p-4">
                <p className="text-sm font-extrabold text-[#050505]">
                  {exp.title} · {exp.company}
                </p>
                {exp.dateRange ? <p className="mt-1 text-xs font-semibold text-black/40">{exp.dateRange}</p> : null}
                {exp.description ? (
                  <p className="mt-2 text-sm leading-6 text-black/55">{exp.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-black/45">No experience added yet.</p>
        )}
      </PreviewSection>

      <PreviewSection label="Featured projects" last>
        {projects.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <div key={project.id || project.projectName} className="rounded-2xl border border-black/8 bg-[#fffcfa] p-4">
                <p className="text-sm font-extrabold text-[#050505]">{project.projectName}</p>
                {project.description ? (
                  <p className="mt-2 text-sm leading-6 text-black/55">{project.description}</p>
                ) : null}
                {project.builderContribution ? (
                  <p className="mt-3 rounded-xl border border-[#ff7417]/20 bg-[#fff9f4] px-3 py-2 text-xs leading-5 text-black/60">
                    <span className="font-extrabold text-[#bf4f08]">Their contribution: </span>
                    {project.builderContribution}
                  </p>
                ) : null}
                {(project.techStack || []).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(project.techStack || []).map((skill) => (
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
        ) : (
          <p className="text-sm leading-6 text-black/45">No projects added yet.</p>
        )}
      </PreviewSection>
    </div>
  );
};

const PreviewSection: React.FC<{ label: string; children: React.ReactNode; last?: boolean }> = ({
  label,
  children,
  last,
}) => (
  <section className={last ? "pt-8" : "border-b border-black/10 py-8"}>
    <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">{label}</p>
    <div className="mt-4">{children}</div>
  </section>
);

export default BuilderProfilePreview;
