import React from 'react';
import { BlurFade } from '@/components/ui/blur-fade';
import { OsButton, OsPageHeader } from '@/components/os';
import type { BuilderDashboardContext } from './types';

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

  const inputClass =
    'mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors text-white placeholder:text-white/30';

  return (
    <BlurFade className="space-y-6">
      <OsPageHeader
        title={
          <>
            Your <span className="font-serif italic hero-underline">Profile</span>
          </>
        }
        subtitle={`Visible to: ${builder.visibilityStatus?.replace('_', ' ') || 'matched founders only'}`}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel p-8 rounded-3xl space-y-6">
          <h3 className="text-lg font-medium text-white/80">Founder-Facing Preview</h3>
          <div>
            <h4 className="text-2xl font-semibold">{builder.name}</h4>
            <p className="text-[#fa7d22] font-medium mt-1">{builder.headline || builder.rolePreference?.[0] || 'Builder'}</p>
          </div>
          {builder.bio ? <p className="text-sm text-white/80 leading-relaxed">{builder.bio}</p> : null}
          <div className="flex flex-wrap gap-2">
            {topSkills.map((skill) => (
              <span key={skill} className="px-2.5 py-1 text-xs rounded-md bg-white/5 border border-white/10">
                {skill}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {projects.slice(0, 2).map((project) => (
              <div key={project._id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="font-medium text-sm">{project.projectName}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl space-y-6">
          <h3 className="text-lg font-medium text-white/80">Edit Profile & Settings</h3>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-white/70">Hours per week</span>
              <input value={settingsHours} onChange={(e) => setSettingsHours(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-sm text-white/70">Remote preference</span>
              <select value={settingsRemote} onChange={(e) => setSettingsRemote(e.target.value)} className={inputClass}>
                <option value="unspecified">Unspecified</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="in_person">In person</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] cursor-pointer text-sm">
            <input type="checkbox" checked={settingsAvailable} onChange={(e) => setSettingsAvailable(e.target.checked)} className="accent-[#fa7d22]" />
            I am currently open to opportunities
          </label>

          <div>
            <p className="text-sm text-white/70 mb-2">Preferred work types</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['full_time', 'Full-time'],
                ['part_time_contract', 'Contract'],
                ['internship', 'Internship'],
                ['paid_sprint', 'Sprint'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleWorkType(value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    settingsWorkTypes.includes(value)
                      ? 'bg-[#fa7d22]/20 border border-[#fa7d22]/40 text-[#fa7d22]'
                      : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm text-white/70">Headline</span>
            <input value={settingsHeadline} onChange={(e) => setSettingsHeadline(e.target.value)} className={inputClass} placeholder="e.g. Full-stack builder" />
          </label>
          <label className="block">
            <span className="text-sm text-white/70">Bio</span>
            <textarea value={settingsBio} onChange={(e) => setSettingsBio(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="A short summary…" />
          </label>

          {[
            ['GitHub', settingsGithub, setSettingsGithub],
            ['LinkedIn', settingsLinkedin, setSettingsLinkedin],
            ['Portfolio', settingsPortfolio, setSettingsPortfolio],
          ].map(([label, value, setter]) => (
            <label key={label as string} className="block">
              <span className="text-sm text-white/70">{label as string}</span>
              <input
                value={value as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className={inputClass}
                placeholder="https://…"
              />
            </label>
          ))}

          <OsButton
            variant="shimmer"
            className="w-full"
            onClick={() => {
              void saveSettings();
            }}
          >
            Save Settings
          </OsButton>

          <OsButton
            variant="glass"
            className="w-full"
            onClick={() => {
              setAgentInput('I want to update my headline and bio');
              setActiveTab('agent');
            }}
          >
            Improve with Agent
          </OsButton>
        </div>
      </div>
    </BlurFade>
  );
}
