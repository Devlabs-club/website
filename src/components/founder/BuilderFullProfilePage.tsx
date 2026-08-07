import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { resolveCompanyLogoUrl } from "@/lib/talent/companyLogo";
import { sortExperiencesByRecency } from "@/lib/talent/experienceNormalize";

export type BuilderProfile = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  graduationYear?: number | null;
  education?: Array<{
    school?: string | null;
    degree?: string | null;
    field?: string | null;
    dateRange?: string | null;
    endDateLabel?: string | null;
    graduationYear?: number | null;
    schoolLogoUrl?: string | null;
    schoolLinkedInUrl?: string | null;
  }>;
  rolePreference?: string[];
  skills?: string[];
  preferredWorkType?: string[];
  experiences?: Array<{
    title: string;
    company: string;
    companyLogoUrl?: string | null;
    location?: string | null;
    dateRange?: string;
    description?: string;
    skills?: string[];
  }>;
  projects?: Array<{ id: string; projectName: string; description?: string; techStack?: string[]; links?: Record<string, string | null> }>;
  links?: Record<string, string | null>;
  founderHighlights?: Array<{ title?: string; detail?: string; source?: string }>;
  githubShowcase?: { featuredCount?: number; additionalProjectCount?: number; reposScanned?: number };
};

const founderSectionTitle = "mb-3 text-[11px] font-semibold uppercase tracking-wider text-black/45";
const defaultSectionTitle = "mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground";

const Section: React.FC<{ title: string; children: React.ReactNode; founder?: boolean }> = ({ title, children, founder }) => (
  <section className="mt-8">
    <h2 className={founder ? founderSectionTitle : defaultSectionTitle}>{title}</h2>
    {children}
  </section>
);

/** Presentational builder profile body, reused by the full page and the founder workspace pane. */
export const BuilderProfileView: React.FC<{
  profile: BuilderProfile;
  afterLinks?: React.ReactNode;
  /** Use explicit warm founder-dashboard colors (avoids dark-mode token clashes in modals). */
  variant?: "default" | "founder";
}> = ({ profile, afterLinks, variant = "default" }) => {
  const founder = variant === "founder";

  return (
    <div className={founder ? "text-black" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className={`h-16 w-16 shrink-0 rounded-full object-cover ${founder ? "border border-[#ece7e1]" : "border border-border"}`}
            />
          ) : (
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold ${
                founder ? "border border-[#ece7e1] bg-[#fdfaf7] text-black/75" : "bg-muted"
              }`}
            >
              {profile.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className={`font-semibold tracking-tight ${founder ? "text-2xl text-black" : "text-3xl"}`}>{profile.name}</h1>
            <p className={`mt-2 ${founder ? "text-sm leading-relaxed text-black/70" : "text-muted-foreground"}`}>
              {profile.headline || profile.bio}
            </p>
            {profile.location ? (
              <p className={`mt-2 text-sm ${founder ? "text-black/55" : "text-muted-foreground"}`}>{profile.location}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(profile.links || {}).map(([label, href]) =>
            href ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={
                  founder
                    ? "inline-flex h-9 items-center gap-1 rounded-xl border border-[#ece7e1] bg-white px-3 text-xs font-semibold text-black/75 hover:bg-[#fdfaf7]"
                    : "inline-flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted"
                }
              >
                {label} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null
          )}
        </div>
      </div>

      {afterLinks ? <div className="mt-8">{afterLinks}</div> : null}

      {(profile.founderHighlights || []).length > 0 ? (
        <Section title="Why this builder stands out" founder={founder}>
          <div className="space-y-2">
            {(profile.founderHighlights || []).slice(0, 6).map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className={`rounded-2xl p-4 ${founder ? "border border-[#ec9149]/30 bg-[#fff7ef]" : "border border-border bg-muted/30"}`}
              >
                <p className={`text-sm font-semibold ${founder ? "text-[#a85a0f]" : ""}`}>{item.title}</p>
                <p className={`mt-1 text-sm leading-relaxed ${founder ? "text-black/70" : "text-muted-foreground"}`}>
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Skills" founder={founder}>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...(profile.skills || []), ...(profile.rolePreference || []), ...(profile.preferredWorkType || [])])].map((skill) => (
            <span
              key={skill}
              className={
                founder
                  ? "rounded-full border border-[#ece7e1] bg-[#fdfaf7] px-3 py-1 text-sm font-medium text-black/70"
                  : "rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
              }
            >
              {skill}
            </span>
          ))}
        </div>
        {(profile.githubShowcase?.additionalProjectCount || 0) > 0 ? (
          <p className={`mt-4 text-sm ${founder ? "text-black/60" : "text-muted-foreground"}`}>
            Skills span {(profile.githubShowcase?.reposScanned || 0) > 0 ? `${profile.githubShowcase?.reposScanned} scanned repos` : "multiple repos"} — top 3 featured below, plus{" "}
            <strong>{profile.githubShowcase?.additionalProjectCount} more shipped GitHub projects</strong>.
          </p>
        ) : null}
      </Section>

      {(profile.education || []).length > 0 ? (
        <Section title="Education" founder={founder}>
          <div className="space-y-3">
            {(profile.education || []).slice(0, 3).map((entry, index) => {
              const date = entry.dateRange || entry.endDateLabel || (entry.graduationYear ? `Class of ${entry.graduationYear}` : null);
              return (
                <div
                  key={`${entry.school}-${index}`}
                  className={`rounded-2xl p-4 ${founder ? "border border-[#ece7e1] bg-[#fffcfa]" : "border border-border"}`}
                >
                  <div className="flex items-start gap-3">
                    {entry.schoolLogoUrl ? (
                      <img
                        src={entry.schoolLogoUrl}
                        alt={`${entry.school || "School"} logo`}
                        className={`h-10 w-10 shrink-0 rounded-xl object-cover ${founder ? "border border-[#ece7e1] bg-white" : "border border-border bg-muted"}`}
                      />
                    ) : (
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
                          founder ? "border border-[#ece7e1] bg-white text-black/35" : "border border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {(entry.school || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className={`font-semibold ${founder ? "text-black" : "font-medium"}`}>{entry.school || "School"}</p>
                      {[entry.degree, entry.field].filter(Boolean).length ? (
                        <p className={`mt-1 text-sm ${founder ? "text-black/60" : "text-muted-foreground"}`}>
                          {[entry.degree, entry.field].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      {date ? <p className={`mt-1 text-xs ${founder ? "text-black/50" : "text-muted-foreground"}`}>{date}</p> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section title="Experience" founder={founder}>
        <div className="space-y-3">
          {sortExperiencesByRecency(profile.experiences || []).map((exp, index) => (
            <div
              key={`${exp.company}-${index}`}
              className={`rounded-2xl p-4 ${founder ? "border border-[#ece7e1] bg-[#fffcfa]" : "border border-border"}`}
            >
              <div className="flex items-start gap-3">
                {(() => {
                  const logoUrl = resolveCompanyLogoUrl(
                    exp.company || "",
                    exp.companyLogoUrl,
                    exp.companyLinkedInUrl
                  );
                  return logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={`${exp.company || "Company"} logo`}
                      className={`h-10 w-10 shrink-0 rounded-xl object-cover ${founder ? "border border-[#ece7e1] bg-white" : "border border-border bg-muted"}`}
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
                        founder ? "border border-[#ece7e1] bg-white text-black/35" : "border border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {(exp.company || "?").slice(0, 1).toUpperCase()}
                    </div>
                  );
                })()}
                <div className="min-w-0">
                  <p className={`font-semibold ${founder ? "text-black" : "font-medium"}`}>
                    {exp.title} · {exp.company}
                  </p>
                  {[exp.location, exp.dateRange].filter(Boolean).length ? (
                    <p className={`mt-1 text-xs ${founder ? "text-black/50" : "text-muted-foreground"}`}>
                      {[exp.location, exp.dateRange].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
              </div>
              {exp.description ? (
                <p className={`mt-2 text-sm leading-relaxed ${founder ? "text-black/65" : "text-muted-foreground"}`}>
                  {exp.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Projects" founder={founder}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(profile.projects || []).map((project) => (
            <div
              key={project.id}
              className={`rounded-2xl p-4 ${founder ? "border border-[#ece7e1] bg-[#fffcfa]" : "border border-border"}`}
            >
              <p className={`font-semibold ${founder ? "text-black" : "font-medium"}`}>{project.projectName}</p>
              {project.description ? (
                <p className={`mt-2 text-sm leading-relaxed ${founder ? "text-black/65" : "text-muted-foreground"}`}>
                  {project.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(project.techStack || []).map((skill) => (
                  <span
                    key={skill}
                    className={
                      founder
                        ? "rounded-full border border-[#ec9149]/25 bg-[#fff7ef] px-2.5 py-1 text-[11px] font-semibold text-[#a85a0f]"
                        : "rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                    }
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};

/** Fetch helper shared by the full page and the founder workspace pane. */
export async function fetchBuilderProfile(builderId: string): Promise<BuilderProfile | null> {
  const res = await fetch(`/api/builder/profile?id=${encodeURIComponent(builderId)}`, { credentials: "include" });
  const data = await res.json();
  return data.success ? (data.profile as BuilderProfile) : null;
}

export const BuilderFullProfilePage: React.FC<{ builderId: string }> = ({ builderId }) => {
  const [profile, setProfile] = useState<BuilderProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setProfile(await fetchBuilderProfile(builderId));
      setLoading(false);
    })();
  }, [builderId]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <a href="/founder/home" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Founder home
        </a>
        {loading ? (
          <div className="flex h-60 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !profile ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Builder profile not found.</p>
        ) : (
          <article className="rounded-2xl border border-border bg-card p-6">
            <BuilderProfileView profile={profile} />
          </article>
        )}
      </main>
    </div>
  );
};

export default BuilderFullProfilePage;
