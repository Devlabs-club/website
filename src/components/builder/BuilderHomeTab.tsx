import React from 'react';
import { Check, Sparkles, ArrowRight } from 'lucide-react';
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { OsButton } from '@/components/os';
import type { BuilderDashboardContext } from './types';
import { cn } from '@/lib/utils';

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const tone =
    score >= 80 ? 'bg-emerald-400/10 border-emerald-400/25 text-emerald-300'
    : score >= 60 ? 'bg-amber-400/10 border-amber-400/25 text-amber-300'
    : 'bg-red-400/10 border-red-400/25 text-red-300';
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold', tone)}>
      {label} · <NumberTicker value={score} className="text-inherit text-xs" />%
    </span>
  );
}

function remoteLabel(pref?: string | null) {
  if (!pref || pref === 'unspecified') return 'Remote or in-person';
  if (pref === 'remote') return 'Remote';
  if (pref === 'hybrid') return 'Hybrid';
  if (pref === 'in_person') return 'In-person';
  return pref.replace('_', ' ');
}

export default function BuilderHomeTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const {
    builder,
    projects,
    introInbox,
    projectStats,
    qualityScore,
    qualityLabel,
    proofScore,
    topRoles,
    topSkills,
    setActiveTab,
    setAgentInput,
    setMessagesThreadId,
    setMessagesIntroId,
  } = ctx;

  return (
    <BlurFade delay={0.05} className="space-y-5">
      {/* Intro banner */}
      {introInbox.length > 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-[#fa7d22]/30 bg-[#fa7d22]/8 p-4 flex flex-wrap items-center justify-between gap-4">
          <BorderBeam size={80} colorFrom="#fa7d22" colorTo="#ffb580" />
          <div>
            <p className="text-sm font-semibold text-white">
              {introInbox.length === 1 ? 'You have a new intro request' : `${introInbox.length} intro requests waiting`}
            </p>
            <p className="text-sm text-white/55 mt-0.5">
              Open the Intros tab to accept or decline.
            </p>
          </div>
          <OsButton
            variant="shimmer"
            onClick={() => {
              const intro = introInbox[0];
              if (intro?.threadId) setMessagesThreadId(intro.threadId);
              if (intro?._id) setMessagesIntroId(intro._id);
              setActiveTab('intros');
            }}
          >
            Review intro <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </OsButton>
        </div>
      ) : null}

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/8 bg-white/[0.02] p-10 md:p-14 text-center flex flex-col items-center">
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)',
          }}
        >
          <DottedGlowBackground
            className="w-full h-full"
            color="rgba(255,255,255,0.4)"
            glowColor="rgba(250, 125, 34, 0.6)"
            gap={14}
            radius={2}
            opacity={0.6}
            speedMin={0.3}
            speedMax={1}
            speedScale={0.8}
          />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl md:text-5xl font-manrope font-semibold tracking-tight text-white mb-3">
            Build a{' '}
            <em className="font-serif not-italic italic hero-underline text-4xl md:text-6xl">proof-backed profile</em>
          </h2>
          <p className="text-white/55 text-base md:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Keep your projects, proof links, contribution details, and availability clear and current.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <OsButton variant="white" onClick={() => setActiveTab('profile')}>
              Update profile
            </OsButton>
            <OsButton variant="glass" onClick={() => setActiveTab('profile')}>
              Add a project
            </OsButton>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Profile Quality — spans 2 */}
        <div className="md:col-span-2 rounded-2xl border border-white/8 bg-white/[0.02] p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-semibold text-white">Profile Quality</p>
            <ScoreBadge score={qualityScore} label={qualityLabel} />
          </div>
          {builder.profileQuality?.oneLineSummary ? (
            <p className="text-sm text-white/60 leading-relaxed">
              {builder.profileQuality.oneLineSummary}
            </p>
          ) : null}
          {builder.profileQuality?.strengths?.length ? (
            <ul className="space-y-1.5">
              {builder.profileQuality.strengths.slice(0, 3).map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-white/70">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  {s.title}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setAgentInput('make my profile better');
              setActiveTab('agent');
            }}
            className="mt-auto w-full py-2.5 rounded-xl bg-[#fa7d22]/8 border border-[#fa7d22]/20 text-[#fa7d22] text-sm font-medium hover:bg-[#fa7d22]/15 transition-colors"
          >
            Improve profile quality
          </button>
        </div>

        {/* Founder Preview */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 flex flex-col gap-3">
          <p className="text-base font-semibold text-white">Founder Preview</p>
          <div>
            <p className="text-[15px] font-semibold text-white">{builder.name}</p>
            <p className="text-[#fa7d22] text-sm font-medium mt-0.5">
              {builder.headline || builder.rolePreference?.[0] || 'Builder'}
            </p>
          </div>
          <p className="text-xs text-white/45">
            {builder.availability?.availableNow ? 'Open to opportunities' : 'Not currently looking'} · {remoteLabel(builder.availability?.remotePreference)}
          </p>
          {topSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {topSkills.slice(0, 4).map((skill) => (
                <span key={skill} className="px-2 py-0.5 text-xs rounded-md bg-white/5 border border-white/8 text-white/70">
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Project Evidence */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <p className="text-base font-semibold text-white mb-4">Project Evidence</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['Projects', projectStats.total],
              ['Verified', projectStats.verifiedContributions],
              ['Devpost', projectStats.devpostImports],
              ['GitHub', projectStats.githubProjects],
            ].map(([label, val]) => (
              <div key={label as string} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                <p className="text-2xl font-bold text-white tabular-nums">
                  <NumberTicker value={val as number} className="text-white text-2xl" />
                </p>
                <p className="text-[11px] text-white/45 mt-1 uppercase tracking-wider">{label as string}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Next Best Action — spans 2 */}
        <div className="md:col-span-2 rounded-2xl border border-[#fa7d22]/20 bg-gradient-to-br from-[#fa7d22]/8 to-transparent p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#fa7d22]" />
            <p className="text-base font-semibold text-white">Next Best Action</p>
          </div>
          {projects.length === 0 ? (
            <>
              <p className="text-[15px] text-white/90 font-medium leading-snug">
                Add a project that shows your {topRoles.slice(0, 2).join(' or ') || 'development'} experience.
              </p>
              <p className="text-sm text-white/50 leading-relaxed">
                Projects are your proof-of-work. Show what you built, what you owned, and where the evidence lives.
              </p>
              <OsButton variant="white" className="mt-2 self-start" onClick={() => setActiveTab('profile')}>
                Add your first project
              </OsButton>
            </>
          ) : proofScore < 70 ? (
            <>
              <p className="text-[15px] text-white/90 font-medium leading-snug">
                Clarify your personal contribution on each project.
              </p>
              <p className="text-sm text-white/50 leading-relaxed">
                Founders evaluate contribution clarity before reaching out. Make it easy to see what you personally built.
              </p>
              <OsButton
                variant="shimmer"
                className="mt-2 self-start"
                onClick={() => {
                  setAgentInput('Review my projects and tell me what contribution details are missing');
                  setActiveTab('agent');
                }}
              >
                Improve proof clarity
              </OsButton>
            </>
          ) : (
            <>
              <p className="text-[15px] text-white/90 font-medium leading-snug">
                Your proof-of-work is in good shape.
              </p>
              <p className="text-sm text-white/50 leading-relaxed">
                Keep your availability current and respond to intro requests when they arrive.
              </p>
            </>
          )}
        </div>
      </div>
    </BlurFade>
  );
}
