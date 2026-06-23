import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

export type BuilderProfile = {
  id: string;
  name: string;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  rolePreference?: string[];
  preferredWorkType?: string[];
  experiences?: Array<{ title: string; company: string; dateRange?: string; description?: string; skills?: string[] }>;
  projects?: Array<{ id: string; projectName: string; description?: string; techStack?: string[]; links?: Record<string, string | null> }>;
  links?: Record<string, string | null>;
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
    {children}
  </section>
);

/** Presentational builder profile body, reused by the full page and the founder workspace pane. */
export const BuilderProfileView: React.FC<{ profile: BuilderProfile }> = ({ profile }) => (
  <div>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{profile.name}</h1>
        <p className="mt-2 text-muted-foreground">{profile.headline || profile.bio}</p>
        <p className="mt-2 text-sm text-muted-foreground">{profile.location}</p>
      </div>
      <div className="flex gap-2">
        {Object.entries(profile.links || {}).map(([label, href]) =>
          href ? (
            <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted">
              {label} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null
        )}
      </div>
    </div>

    <Section title="Skills">
      <div className="flex flex-wrap gap-2">
        {[...(profile.rolePreference || []), ...(profile.preferredWorkType || [])].map((skill) => (
          <span key={skill} className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">{skill}</span>
        ))}
      </div>
    </Section>

    <Section title="Experience">
      <div className="space-y-3">
        {(profile.experiences || []).map((exp, index) => (
          <div key={`${exp.company}-${index}`} className="rounded-2xl border border-border p-4">
            <p className="font-medium">{exp.title} · {exp.company}</p>
            <p className="mt-1 text-xs text-muted-foreground">{exp.dateRange}</p>
            <p className="mt-2 text-sm text-muted-foreground">{exp.description}</p>
          </div>
        ))}
      </div>
    </Section>

    <Section title="Projects">
      <div className="grid gap-3 sm:grid-cols-2">
        {(profile.projects || []).map((project) => (
          <div key={project.id} className="rounded-2xl border border-border p-4">
            <p className="font-medium">{project.projectName}</p>
            <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(project.techStack || []).map((skill) => (
                <span key={skill} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{skill}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  </div>
);

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
