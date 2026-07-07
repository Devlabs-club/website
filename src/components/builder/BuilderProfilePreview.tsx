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
};

export const BuilderProfilePreview: React.FC<{ profile: BuilderProfileView }> = ({ profile }) => {
  const skills = (profile.skills?.length ? profile.skills : profile.rolePreference || []).slice(0, 12);
  const showOpenTo = (profile.rolePreference?.length ?? 0) > 0 && (profile.skills?.length ?? 0) > 0;
  const experiences = (profile.experiences || []).slice(0, 3);
  const projects = (profile.projects || []).slice(0, 3);

  return (
    <div className="builder-profile-preview font-manrope mx-auto w-full max-w-3xl">
      <header className="flex items-start gap-5 border-b border-black/10 pb-8">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name || "Builder"}
            className="h-16 w-16 shrink-0 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-[#fff5ef] text-xl font-extrabold text-[#ff7417]">
            {(profile.name || "B").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 pt-0.5">
          <h2 className="truncate text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight text-[#050505]">
            {profile.name || "Builder"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-black/55">
            {profile.headline || profile.bio || "Proof-of-work builder"}
          </p>
          {(profile.location || profile.universityOrCompany) ? (
            <p className="mt-2 text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/40">
              {profile.location || profile.universityOrCompany}
            </p>
          ) : null}
        </div>
      </header>

      <PreviewSection label="Skills">
        {skills.length ? (
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill}
                className="border border-black/10 bg-[#fbf6f3]/86 px-2.5 py-1 text-xs font-semibold text-black/65"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-black/45">No skills added yet.</p>
        )}
      </PreviewSection>

      {showOpenTo ? (
        <PreviewSection label="Open to">
          <div className="flex flex-wrap gap-2">
            {profile.rolePreference!.slice(0, 6).map((role) => (
              <span
                key={role}
                className="border border-[#ff7417]/35 bg-[#fff5ef] px-2.5 py-1 text-xs font-semibold text-[#bf4f08]"
              >
                {role}
              </span>
            ))}
          </div>
        </PreviewSection>
      ) : null}

      <PreviewSection label="Experience">
        {experiences.length ? (
          <ul className="divide-y divide-black/10">
            {experiences.map((exp, index) => (
              <li key={`${exp.company}-${index}`} className="py-4 first:pt-0 last:pb-0">
                <p className="text-sm font-extrabold text-[#050505]">
                  {exp.title} · {exp.company}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-black/50">{exp.description || exp.dateRange}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-6 text-black/45">No experience added yet.</p>
        )}
      </PreviewSection>

      <PreviewSection label="Projects" last>
        {projects.length ? (
          <ul className="divide-y divide-black/10">
            {projects.map((project) => (
              <li key={project.id || project.projectName} className="py-4 first:pt-0 last:pb-0">
                <p className="text-sm font-extrabold text-[#050505]">{project.projectName}</p>
                {project.description ? (
                  <p className="mt-1.5 text-sm leading-6 text-black/50">{project.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
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
