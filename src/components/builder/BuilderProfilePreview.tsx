import React from "react";

export type BuilderProfileView = {
  id?: string;
  name?: string;
  email?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  universityOrCompany?: string | null;
  rolePreference?: string[];
  preferredWorkType?: string[];
  experiences?: Array<{ title: string; company: string; dateRange?: string; description?: string; skills?: string[] }>;
  projects?: Array<{ id?: string; projectName: string; description?: string | null; techStack?: string[] }>;
  links?: Record<string, string | null>;
  verificationStatus?: string;
};

export const BuilderProfilePreview: React.FC<{ profile: BuilderProfileView }> = ({ profile }) => {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
          {(profile.name || "B").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{profile.name || "Builder"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{profile.headline || profile.bio || "Proof-of-work builder"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{profile.location || profile.universityOrCompany}</p>
        </div>
      </div>

      <PreviewSection title="Skills">
        <div className="flex flex-wrap gap-1.5">
          {[...(profile.rolePreference || []), ...(profile.preferredWorkType || [])].slice(0, 10).map((skill) => (
            <span key={skill} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{skill}</span>
          ))}
        </div>
      </PreviewSection>

      <PreviewSection title="Experience">
        <div className="space-y-3">
          {(profile.experiences || []).slice(0, 3).map((exp, index) => (
            <div key={`${exp.company}-${index}`} className="rounded-xl bg-muted/50 p-3">
              <p className="text-sm font-medium">{exp.title} · {exp.company}</p>
              <p className="mt-1 text-xs text-muted-foreground">{exp.description || exp.dateRange}</p>
            </div>
          ))}
          {!(profile.experiences || []).length && <p className="text-sm text-muted-foreground">No experience added yet.</p>}
        </div>
      </PreviewSection>

      <PreviewSection title="Projects">
        <div className="space-y-3">
          {(profile.projects || []).slice(0, 3).map((project) => (
            <div key={project.id || project.projectName} className="rounded-xl bg-muted/50 p-3">
              <p className="text-sm font-medium">{project.projectName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{project.description}</p>
            </div>
          ))}
          {!(profile.projects || []).length && <p className="text-sm text-muted-foreground">No projects added yet.</p>}
        </div>
      </PreviewSection>
    </div>
  );
};

const PreviewSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-5">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </section>
);

export default BuilderProfilePreview;
