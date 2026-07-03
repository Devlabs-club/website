import React from "react";

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
};

export const BuilderProfilePreview: React.FC<{ profile: BuilderProfileView }> = ({ profile }) => {
  return (
    <div className="rounded-[22px] border border-[#1a140f]/10 bg-[#fbfaf7] p-5 shadow-[0_16px_42px_rgba(33,24,16,0.07)]">
      <div className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-[0_10px_26px_rgba(33,24,16,0.05)]">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name || "Builder"}
            className="h-16 w-16 shrink-0 rounded-2xl border border-[#1a140f]/10 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#fa7d22]/25 bg-[#fff7ef] text-lg font-extrabold text-[#fa7d22]">
            {(profile.name || "B").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-xl font-extrabold tracking-tight text-[#14110f]">{profile.name || "Builder"}</h2>
          <p className="mt-1 text-sm font-medium leading-6 text-[#5e554d]">{profile.headline || profile.bio || "Proof-of-work builder"}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#9b9188]">{profile.location || profile.universityOrCompany}</p>
        </div>
      </div>

      <PreviewSection title="Skills">
        <div className="flex flex-wrap gap-1.5">
          {[...(profile.rolePreference || []), ...(profile.preferredWorkType || [])].slice(0, 10).map((skill) => (
            <span key={skill} className="rounded-full border border-[#1a140f]/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6f665d]">{skill}</span>
          ))}
        </div>
      </PreviewSection>

      <PreviewSection title="Experience">
        <div className="space-y-3">
          {(profile.experiences || []).slice(0, 3).map((exp, index) => (
            <div key={`${exp.company}-${index}`} className="rounded-2xl border border-[#1a140f]/10 bg-white p-4">
              <p className="text-sm font-bold text-[#14110f]">{exp.title} · {exp.company}</p>
              <p className="mt-1 text-xs leading-5 text-[#746b62]">{exp.description || exp.dateRange}</p>
            </div>
          ))}
          {!(profile.experiences || []).length && <p className="text-sm text-[#746b62]">No experience added yet.</p>}
        </div>
      </PreviewSection>

      <PreviewSection title="Projects">
        <div className="space-y-3">
          {(profile.projects || []).slice(0, 3).map((project) => (
            <div key={project.id || project.projectName} className="rounded-2xl border border-[#1a140f]/10 bg-white p-4">
              <p className="text-sm font-bold text-[#14110f]">{project.projectName}</p>
              <p className="mt-1 text-xs leading-5 text-[#746b62]">{project.description}</p>
            </div>
          ))}
          {!(profile.projects || []).length && <p className="text-sm text-[#746b62]">No projects added yet.</p>}
        </div>
      </PreviewSection>
    </div>
  );
};

const PreviewSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-5">
    <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b9188]">{title}</h3>
    {children}
  </section>
);

export default BuilderProfilePreview;
