import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { OsButton, OsBadge, scoreTone } from '@/components/os';
import type { BuilderDashboardContext } from './types';

export default function BuilderHomeTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const {
    builder,
    projects,
    introInbox,
    projectStats,
    qualityScore,
    qualityLabel,
    matchScore,
    topRoles,
    topSkills,
    setActiveTab,
    setAgentInput,
    setMessagesThreadId,
    setMessagesIntroId,
  } = ctx;

  return (
    <BlurFade delay={0.05} className="space-y-6">
      {introInbox.length > 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-[#fa7d22]/30 bg-[#fa7d22]/10 p-5 flex flex-wrap items-center justify-between gap-4">
          <BorderBeam size={80} colorFrom="#fa7d22" colorTo="#ffb580" />
          <div>
            <p className="text-sm font-semibold text-white">
              {introInbox.length === 1
                ? 'You have a new intro request'
                : `You have ${introInbox.length} intro requests`}
            </p>
            <p className="text-sm text-white/70 mt-1">Open Messages to read the founder&apos;s note and accept or decline.</p>
          </div>
          <OsButton
            variant="shimmer"
            onClick={() => {
              const intro = introInbox[0];
              if (intro?.threadId) setMessagesThreadId(intro.threadId);
              if (intro?._id) setMessagesIntroId(intro._id);
              setActiveTab('messages');
            }}
          >
            Review intro
          </OsButton>
        </div>
      ) : null}

      <div className="relative overflow-hidden glass-panel-strong p-8 md:p-12 text-center flex flex-col items-center rounded-3xl">
        <div
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 70%)',
          }}
        >
          <DottedGlowBackground
            className="w-full h-full"
            color="rgba(255,255,255,0.5)"
            glowColor="rgba(250, 125, 34, 0.75)"
            gap={14}
            radius={2}
            opacity={0.7}
            speedMin={0.3}
            speedMax={1}
            speedScale={0.8}
          />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl md:text-5xl font-manrope tracking-tight text-white mb-4">
            Build your{' '}
            <span className="font-serif italic hero-underline text-4xl md:text-6xl text-white">proof-of-work</span>
          </h2>
          <div className="text-white/70 text-lg max-w-2xl mx-auto mb-8">
            <TextGenerateEffect
              words="Complete your DevLabs profile so founders can discover your skills, projects, and availability."
              className="text-lg font-normal text-white/70"
              duration={0.3}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <OsButton variant="white" onClick={() => setActiveTab('profile')}>
              Improve my profile
            </OsButton>
            <OsButton variant="glass" onClick={() => setActiveTab('projects')}>
              Add a project
            </OsButton>
          </div>
        </div>
      </div>

      <BentoGrid className="md:auto-rows-[20rem]">
        <BentoGridItem
          className="md:col-span-2 glass-panel !bg-white/[0.03] !border-white/10 !shadow-none hover:!border-[#fa7d22]/30"
          title={
            <div className="flex justify-between items-start gap-3">
              <span className="text-xl font-semibold text-white">Profile Quality</span>
              <OsBadge variant="score" score={qualityScore}>
                {qualityLabel} · <NumberTicker value={qualityScore} className="text-inherit text-sm" />%
              </OsBadge>
            </div>
          }
          description={
            <div className="space-y-3 mt-2">
              <p className="text-sm text-white/80 leading-relaxed">
                {builder.profileQuality?.oneLineSummary || 'Complete your profile to get matched.'}
              </p>
              {builder.profileQuality?.strengths?.length ? (
                <ul className="text-sm text-white/60 space-y-1">
                  {builder.profileQuality.strengths.slice(0, 3).map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{s.title}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          }
          header={
            <button
              type="button"
              onClick={() => {
                setAgentInput('make my profile better');
                setActiveTab('agent');
              }}
              className="mt-auto w-full py-2.5 rounded-xl bg-[#fa7d22]/10 border border-[#fa7d22]/30 text-[#fa7d22] font-medium hover:bg-[#fa7d22]/20 transition-colors text-sm"
            >
              Improve profile quality
            </button>
          }
        />

        <BentoGridItem
          className="glass-panel !bg-white/[0.03] !border-white/10 !shadow-none"
          title={<span className="text-xl font-semibold text-white">Founder Preview</span>}
          description={
            <div className="space-y-3 mt-2 text-sm text-white/70">
              <div>
                <h4 className="text-lg font-semibold text-white">{builder.name}</h4>
                <p className="text-[#fa7d22]">{builder.rolePreference?.[0] || 'Builder'}</p>
              </div>
              <p>
                {builder.availability?.availableNow ? 'Open to opportunities' : 'Not currently looking'} ·{' '}
                {builder.availability?.remotePreference?.replace('_', ' ') || 'Remote or in-person'}
              </p>
              <div className="flex flex-wrap gap-2">
                {topSkills.slice(0, 4).map((skill) => (
                  <span key={skill} className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          }
        />

        <BentoGridItem
          className="glass-panel !bg-white/[0.03] !border-white/10 !shadow-none"
          title={<span className="text-xl font-semibold text-white">Proof of Work</span>}
          description={
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[
                ['Projects', projectStats.total],
                ['Verified', projectStats.verifiedContributions],
                ['Devpost', projectStats.devpostImports],
                ['GitHub', projectStats.githubProjects],
              ].map(([label, val]) => (
                <div key={label as string} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-center">
                  <p className="text-2xl font-semibold text-white">
                    <NumberTicker value={val as number} className="text-white text-2xl" />
                  </p>
                  <p className="text-xs text-white/60 mt-1">{label as string}</p>
                </div>
              ))}
            </div>
          }
        />

        <BentoGridItem
          className="md:col-span-2 relative overflow-hidden !border-[#fa7d22]/30 !bg-gradient-to-br from-[#fa7d22]/10 to-transparent"
          title={
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#fa7d22]" />
              <span className="text-xl font-semibold text-white">Next Best Action</span>
            </div>
          }
          description={
            <div className="mt-3 space-y-2">
              {projects.length === 0 ? (
                <>
                  <p className="text-lg text-white/90 font-medium">
                    Add a project that proves your {topRoles.slice(0, 3).join(', ') || 'development'} experience.
                  </p>
                  <p className="text-sm text-white/70">
                    Founders are 3x more likely to request an intro when your skills are backed by a real project.
                  </p>
                </>
              ) : matchScore < 80 ? (
                <>
                  <p className="text-lg text-white/90 font-medium">Improve your profile quality to reach Match Ready status.</p>
                  <p className="text-sm text-white/70">Only high-quality profiles are shown to founders in opportunity matching.</p>
                </>
              ) : (
                <>
                  <p className="text-lg text-white/90 font-medium">You are Match Ready!</p>
                  <p className="text-sm text-white/70">Keep your availability up to date and respond to opportunities when they arrive.</p>
                </>
              )}
            </div>
          }
          header={
            projects.length === 0 ? (
              <OsButton variant="white" className="mt-4 w-full" onClick={() => setActiveTab('projects')}>
                Add proof-of-work
              </OsButton>
            ) : matchScore < 80 ? (
              <OsButton
                variant="shimmer"
                className="mt-4 w-full"
                onClick={() => {
                  setAgentInput('make my profile better');
                  setActiveTab('agent');
                }}
              >
                Improve profile quality
              </OsButton>
            ) : null
          }
        />
      </BentoGrid>
    </BlurFade>
  );
}
