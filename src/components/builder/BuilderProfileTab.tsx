import React from 'react';
import { AlertCircle, Plus, ExternalLink } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { OsButton, OsPageHeader } from '@/components/os';
import type { BuilderDashboardContext } from './types';
import { cn } from '@/lib/utils';

function remoteLabel(pref?: string | null) {
  if (!pref || pref === 'unspecified') return 'Remote or in-person';
  if (pref === 'remote') return 'Remote';
  if (pref === 'hybrid') return 'Hybrid';
  if (pref === 'in_person') return 'In-person';
  return pref.replace('_', ' ');
}

const inputClass =
  'w-full rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#fa7d22]/50 focus:outline-none focus:ring-1 focus:ring-[#fa7d22]/20 transition-all placeholder:text-white/25';

export default function BuilderProfileTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const {
    builder,
    projects,
    topSkills,
    settingsHours,
    settingsRemote,
    settingsAvailable,
    settingsWorkTypes,
    settingsHeadline,
    settingsBio,
    settingsGithub,
    settingsLinkedin,
    settingsPortfolio,
    setSettingsHours,
    setSettingsRemote,
    setSettingsAvailable,
    setSettingsHeadline,
    setSettingsBio,
    setSettingsGithub,
    setSettingsLinkedin,
    setSettingsPortfolio,
    toggleWorkType,
    saveSettings,
    setActiveTab,
    setAgentInput,
  } = ctx;

  return (
    <BlurFade className="space-y-5">
      <OsPageHeader
        title={
          <>
            Your <span className="font-serif italic hero-underline">Profile</span>
          </>
        }
        subtitle={`Visibility: ${builder.visibilityStatus?.replace('_', ' ') || 'devlabs only'}`}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Founder-facing preview */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-4">Founder-Facing Preview</p>
            <p className="text-2xl font-semibold text-white">{builder.name}</p>
            <p className="text-[#fa7d22] font-medium mt-1">{builder.headline || builder.rolePreference?.[0] || 'Builder'}</p>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/45">
            <span className={cn('w-1.5 h-1.5 rounded-full', builder.availability?.availableNow ? 'bg-emerald-400' : 'bg-white/20')} />
            {builder.availability?.availableNow ? 'Open to opportunities' : 'Not looking'} · {remoteLabel(builder.availability?.remotePreference)}
          </div>

          {builder.bio ? (
            <p className="text-sm text-white/65 leading-relaxed border-l-2 border-white/10 pl-3">{builder.bio}</p>
          ) : null}

          {topSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {topSkills.slice(0, 6).map((skill) => (
                <span key={skill} className="px-2.5 py-1 text-xs rounded-md bg-white/5 border border-white/8 text-white/70">
                  {skill}
                </span>
              ))}
            </div>
          ) : null}

          {builder.experiences?.length ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs uppercase tracking-wider text-white/35 font-semibold">Experience</p>
              {builder.experiences.slice(0, 3).map((experience) => (
                <div key={experience.sourceId || `${experience.company}-${experience.title}`} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-start gap-3">
                    {experience.companyLogoUrl ? (
                      <img
                        src={experience.companyLogoUrl}
                        alt={`${experience.company || 'Company'} logo`}
                        className="h-9 w-9 rounded-md object-cover bg-white/5 border border-white/8"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-md bg-white/5 border border-white/8 flex items-center justify-center text-xs text-white/35">
                        {(experience.company || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-white truncate">{experience.title}</p>
                      <p className="text-xs text-white/50 truncate">
                        {experience.company}
                        {experience.dateRange ? ` · ${experience.dateRange}` : ''}
                      </p>
                      {experience.description ? (
                        <p className="text-xs text-white/40 mt-1 line-clamp-2">{experience.description}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2 pt-1">
            {projects.slice(0, 2).map((project) => (
              <div key={project._id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="font-medium text-sm text-white">{project.projectName}</p>
                {project.description ? (
                  <p className="text-xs text-white/45 mt-1 line-clamp-1">{project.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-5">
          <p className="text-xs uppercase tracking-wider text-white/40 font-semibold">Edit Profile & Settings</p>

          {/* Availability toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settingsAvailable}
                onChange={(e) => setSettingsAvailable(e.target.checked)}
              />
              <div className="w-9 h-5 rounded-full bg-white/10 peer-checked:bg-[#fa7d22] transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-white/80">Open to opportunities</span>
          </label>

          {/* Hours + Remote */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-white/45 uppercase tracking-wider font-semibold">Hours / week</span>
              <input
                value={settingsHours}
                onChange={(e) => setSettingsHours(e.target.value)}
                className={cn(inputClass, 'mt-1.5')}
                placeholder="e.g. 20"
                type="number"
                min="1"
                max="60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45 uppercase tracking-wider font-semibold">Remote preference</span>
              <select value={settingsRemote} onChange={(e) => setSettingsRemote(e.target.value)} className={cn(inputClass, 'mt-1.5')}>
                <option value="unspecified">Unspecified</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="in_person">In-person</option>
              </select>
            </label>
          </div>

          {/* Hire type */}
          <div>
            <p className="text-xs text-white/45 uppercase tracking-wider font-semibold mb-2">Preferred hire type</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['full_time', 'Full-time'],
                ['internship', 'Internship'],
                ['either', 'Either works'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleWorkType(value)}
                  className={cn(
                    'px-3.5 py-2 rounded-xl text-sm font-medium transition-all',
                    settingsWorkTypes.includes(value)
                      ? 'bg-[#fa7d22]/15 border border-[#fa7d22]/35 text-[#fa7d22]'
                      : 'bg-white/[0.03] border border-white/10 text-white/55 hover:text-white hover:bg-white/8'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Headline */}
          <label className="block">
            <span className="text-xs text-white/45 uppercase tracking-wider font-semibold">Headline</span>
            <input
              value={settingsHeadline}
              onChange={(e) => setSettingsHeadline(e.target.value)}
              className={cn(inputClass, 'mt-1.5')}
              placeholder="e.g. Full-stack builder"
            />
          </label>

          {/* Bio */}
          <label className="block">
            <span className="text-xs text-white/45 uppercase tracking-wider font-semibold">Bio</span>
            <textarea
              value={settingsBio}
              onChange={(e) => setSettingsBio(e.target.value)}
              rows={3}
              className={cn(inputClass, 'mt-1.5 resize-none')}
              placeholder="A short summary founders will read…"
            />
          </label>

          {/* Links */}
          <div className="space-y-3">
            <p className="text-xs text-white/45 uppercase tracking-wider font-semibold">Links</p>
            {[
              ['GitHub', settingsGithub, setSettingsGithub, 'https://github.com/'],
              ['LinkedIn', settingsLinkedin, setSettingsLinkedin, 'https://linkedin.com/in/'],
              ['Portfolio', settingsPortfolio, setSettingsPortfolio, 'https://'],
            ].map(([label, value, setter, placeholder]) => (
              <div key={label as string} className="flex items-center gap-2">
                <span className="text-xs text-white/40 w-16 shrink-0">{label as string}</span>
                <input
                  value={value as string}
                  onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  className={inputClass}
                  placeholder={placeholder as string}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-1">
            <OsButton variant="shimmer" className="flex-1" onClick={() => void saveSettings()}>
              Save changes
            </OsButton>
            <OsButton
              variant="glass"
              onClick={() => {
                setAgentInput('I want to update my headline and bio');
                setActiveTab('agent');
              }}
            >
              Agent
            </OsButton>
          </div>
        </div>
      </div>

      {/* Projects */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Projects</h3>
            <p className="text-xs text-white/45 mt-1">
              Your proof-of-work. Show what you built, what you owned, and where the evidence lives.
            </p>
          </div>
          <OsButton
            variant="glass"
            onClick={() => {
              setAgentInput('I want to add a new project to my profile');
              setActiveTab('agent');
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add project
          </OsButton>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-10 text-center">
            <p className="text-white/45 text-sm">No projects added yet.</p>
            <p className="text-white/30 text-xs mt-1.5">
              Import from GitHub or Devpost, or describe one to the Agent.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <OsButton
                variant="glass"
                onClick={() => {
                  setAgentInput('Import my Devpost project');
                  setActiveTab('agent');
                }}
              >
                Import from Devpost
              </OsButton>
              <OsButton
                variant="shimmer"
                onClick={() => {
                  setAgentInput('I want to add a project manually');
                  setActiveTab('agent');
                }}
              >
                Add manually
              </OsButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project._id}
                className="rounded-xl border border-white/8 bg-white/[0.015] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="font-semibold text-[15px] text-white">{project.projectName}</p>
                      <span className={cn(
                        'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold',
                        project.verificationStatus === 'builder_confirmed'
                          ? 'bg-emerald-400/10 border border-emerald-400/20 text-emerald-400'
                          : 'bg-white/5 border border-white/10 text-white/40'
                      )}>
                        {project.verificationStatus === 'builder_confirmed' ? 'Evidence linked' : project.source || 'Self-reported'}
                      </span>
                    </div>
                    {project.description ? (
                      <p className="text-sm text-white/50 mt-1.5 line-clamp-2 leading-relaxed">{project.description}</p>
                    ) : null}
                    {project.builderContribution ? (
                      <p className="mt-3 text-sm text-white/75 p-3 rounded-lg bg-white/[0.03] border border-white/8 leading-relaxed">
                        {project.builderContribution}
                      </p>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 text-amber-400/80 text-xs p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Contribution missing — founders want to see what you personally built.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAgentInput(`Add my personal contribution to the project: ${project.projectName}`);
                            setActiveTab('agent');
                          }}
                          className="ml-auto text-xs text-amber-400 underline shrink-0 hover:no-underline"
                        >
                          Fix
                        </button>
                      </div>
                    )}
                    {(project.techStack || []).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(project.techStack || []).slice(0, 6).map((tech) => (
                          <span key={tech} className="text-xs px-2 py-0.5 rounded-md bg-[#fa7d22]/8 border border-[#fa7d22]/15 text-[#fa7d22]/80">
                            {tech}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAgentInput(`Help me improve the project: ${project.projectName}`);
                      setActiveTab('agent');
                    }}
                    className="text-xs text-white/40 hover:text-[#fa7d22] transition-colors shrink-0 mt-0.5"
                  >
                    Edit with Agent
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BlurFade>
  );
}
