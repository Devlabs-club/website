import React from 'react';
import { ExternalLink } from 'lucide-react';
import { resolveCompanyLogoUrl } from '@/lib/talent/companyLogo';
import { sortExperiencesByRecency } from '@/lib/talent/experienceNormalize';
import { visibleBuilderLinkEntries } from '@/lib/talent/externalProfileHref';
import type { BuilderProfileView } from './BuilderProfilePreview';
import { profileIdentityBodyClass, profilePaneBodyClass, profilePaneClass, profilePaneHeaderClass, profileSectionLabelClass } from './builderProfileLayout';

export default function BuilderProfileIdentityPanel({ profile }: { profile: BuilderProfileView }) {
  const skills = [...new Set([...(profile.skills || []), ...(profile.preferredWorkType || [])])].slice(0, 16);
  const displaySkills = skills;
  const experiences = sortExperiencesByRecency(profile.experiences || []).slice(0, 6);
  const education = (profile.education || []).slice(0, 4);
  const linkEntries = visibleBuilderLinkEntries(profile.links, profile.id);

  return (
    <div className={`${profilePaneClass} h-full`}>
      <div className={profilePaneHeaderClass}>
        <p className="text-sm font-semibold text-black">Profile</p>
        <p className="mt-1 text-xs text-black/45">Basics founders scan first — photo, links, experience, education.</p>
      </div>

      <div className={profileIdentityBodyClass}>
        <div className="flex items-start gap-4">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name || 'Builder'}
              className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-black/10"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#fff5ef] text-2xl font-extrabold text-[#ff7417] ring-1 ring-[#ff7417]/20">
              {(profile.name || 'B').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 pt-0.5">
            <h2 className="text-xl font-extrabold tracking-tight text-[#050505]">{profile.name || 'Builder'}</h2>
            {profile.headline ? (
              <p className="mt-1.5 text-sm font-semibold leading-relaxed text-[#050505]/85">{profile.headline}</p>
            ) : null}
            {(profile.location || profile.universityOrCompany) ? (
              <p className="mt-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-black/40">
                {[profile.location, profile.universityOrCompany].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
        </div>

        {linkEntries.length ? (
          <section>
            <p className={profileSectionLabelClass}>Links</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {linkEntries.map(({ key, href, label }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-black/70 transition hover:border-[#ff7417]/40 hover:bg-[#fff5ef]"
                >
                  {label} <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {profile.bio && profile.bio !== profile.headline ? (
          <section>
            <p className={profileSectionLabelClass}>About</p>
            <p className="mt-3 text-sm leading-7 text-black/60">{profile.bio}</p>
          </section>
        ) : null}

        {displaySkills.length ? (
          <section>
            <p className={profileSectionLabelClass}>Skills</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {displaySkills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-black/10 bg-[#fbf6f3]/86 px-3 py-1.5 text-xs font-semibold text-black/65"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {(profile.rolePreference?.length ?? 0) > 0 ? (
          <section>
            <p className={profileSectionLabelClass}>Open to</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.rolePreference!.slice(0, 6).map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-[#ff7417]/35 bg-[#fff5ef] px-3 py-1.5 text-xs font-semibold text-[#bf4f08]"
                >
                  {role}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {profile.workAuthorization ? (
          <section>
            <p className={profileSectionLabelClass}>Work authorization</p>
            <p className="mt-3 text-sm leading-6 text-black/60">{profile.workAuthorization}</p>
          </section>
        ) : null}

        {experiences.length ? (
          <section>
            <p className={profileSectionLabelClass}>Experience</p>
            <div className="mt-3 space-y-3">
              {experiences.map((exp, index) => {
                const logoUrl = resolveCompanyLogoUrl(exp.company, exp.companyLogoUrl, exp.companyLinkedInUrl);
                return (
                  <div key={`${exp.company}-${index}`} className="rounded-2xl border border-black/8 bg-[#fffcfa] p-3.5">
                    <div className="flex items-start gap-3">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={`${exp.company} logo`}
                          className="h-9 w-9 shrink-0 rounded-xl border border-black/10 bg-white object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-[11px] font-extrabold text-black/35">
                          {(exp.company || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#050505]">{exp.title}</p>
                        <p className="mt-0.5 text-sm text-black/55">{exp.company}</p>
                        {exp.dateRange ? <p className="mt-1 text-xs font-semibold text-black/40">{exp.dateRange}</p> : null}
                      </div>
                    </div>
                    {exp.description ? (
                      <p className="mt-2 text-sm leading-6 text-black/55">{exp.description}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {education.length ? (
          <section>
            <p className={profileSectionLabelClass}>Education</p>
            <div className="mt-3 space-y-3">
              {education.map((entry, index) => {
                const date =
                  entry.dateRange ||
                  entry.endDateLabel ||
                  (entry.graduationYear ? `Class of ${entry.graduationYear}` : null);
                return (
                  <div key={`${entry.school}-${index}`} className="rounded-2xl border border-black/8 bg-[#fffcfa] p-3.5">
                    <div className="flex items-start gap-3">
                      {entry.schoolLogoUrl ? (
                        <img
                          src={entry.schoolLogoUrl}
                          alt={`${entry.school || 'School'} logo`}
                          className="h-9 w-9 shrink-0 rounded-xl border border-black/10 bg-white object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-[11px] font-extrabold text-black/35">
                          {(entry.school || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#050505]">{entry.school || 'School'}</p>
                        {[entry.degree, entry.field].filter(Boolean).length ? (
                          <p className="mt-0.5 text-sm text-black/55">
                            {[entry.degree, entry.field].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                        {date ? <p className="mt-1 text-xs font-semibold text-black/40">{date}</p> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
