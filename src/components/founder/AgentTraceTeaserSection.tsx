import React from 'react';
import { ChevronRight, Lock, Sparkles } from 'lucide-react';
import type { RoleFitTracePayload } from '@/lib/talent/roleFitTrace';

export type AgentTraceTeaser = {
  locked: boolean;
  label: string;
  sourceBadges: string[];
  visibleInsight: string;
  quantifiedSignals?: string[];
  redacted: string[];
  hasAgentWrapped?: boolean;
  archetype?: string | null;
  wrappedScore?: number | null;
  bestFitRoles?: string[];
  evidenceStrength?: string | null;
  projectHighlight?: string | null;
  roleFitTrace?: RoleFitTracePayload | null;
  traceFreshness?: {
    daysSinceUpload: number;
    label: string;
    isFresh: boolean;
    sessionCount?: number;
  } | null;
  visibleRiskFlags?: string[];
  interviewProbes?: string[];
};

type Props = {
  teaser: AgentTraceTeaser;
  compact?: boolean;
  onExpand?: () => void;
  showRoleFit?: boolean;
};

const LOCKED_FEATURE_HINTS = [
  'How they use AI agents day to day',
  'Build → test → fix loops from real sessions',
  'Interview questions tailored to this role',
];

function matchLabel(score: number) {
  if (score >= 75) return 'Strong skills overlap';
  if (score >= 50) return 'Partial skills overlap';
  return 'Limited skills overlap';
}

function RoleFitStrip({
  roleFit,
  compact,
}: {
  roleFit: RoleFitTracePayload;
  compact?: boolean;
}) {
  const matched = roleFit.relevantSignals
    .filter((s) => !s.startsWith('gap:'))
    .slice(0, 3);
  const score = roleFit.alignmentScore;

  return (
    <div className={`rounded-xl border border-black/[0.06] bg-white ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b55f1b]">
            Role match
          </p>
          <p className={`mt-1 font-semibold text-[#050505] ${compact ? 'text-sm' : 'text-[15px]'}`}>
            {matchLabel(score)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-bold tabular-nums text-[#050505] ${compact ? 'text-lg' : 'text-xl'}`}>
            {score}%
          </p>
          <p className="text-[11px] text-black/40">from profile</p>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className="h-full rounded-full bg-[#ff7417]"
          style={{ width: `${Math.max(8, Math.min(100, score))}%` }}
        />
      </div>
      {!compact && matched.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {matched.map((signal) => (
            <span
              key={signal}
              className="rounded-md bg-[#fff5ef] px-2 py-0.5 text-[11px] font-medium text-[#8a4609]"
            >
              {signal}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const AgentTraceTeaserSection: React.FC<Props> = ({
  teaser,
  compact,
  onExpand,
  showRoleFit = true,
}) => {
  const headline = teaser.hasAgentWrapped
    ? teaser.archetype || teaser.label || 'Verified coding trace'
    : teaser.archetype || 'How they ship';
  const lockedRows =
    teaser.redacted.length > 0
      ? teaser.redacted.slice(0, compact ? 2 : 3)
      : LOCKED_FEATURE_HINTS.slice(0, compact ? 2 : 3);

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-[#ec9149]/35 bg-gradient-to-b from-[#fff9f3] to-[#fff4ea] shadow-[0_8px_28px_rgba(255,116,23,0.08)] ${
        compact ? 'p-3.5' : 'mb-6 p-5'
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#ff7417]/10 blur-2xl" />

      <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff7417] text-white shadow-[0_4px_12px_rgba(255,116,23,0.35)]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#b55f1b]">
              Agent Trace
            </p>
            <p className="text-[12px] text-black/45">
              {teaser.hasAgentWrapped
                ? 'From their verified coding sessions'
                : 'Preview from resume, LinkedIn & projects'}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            teaser.hasAgentWrapped
              ? 'border border-[#ec9149]/40 bg-white text-[#9a4f0c]'
              : 'border border-black/10 bg-white/90 text-black/50'
          }`}
        >
          {teaser.hasAgentWrapped ? 'Verified' : 'Preview'}
        </span>
      </div>

      <p className={`relative font-semibold tracking-[-0.02em] text-[#050505] ${compact ? 'text-base' : 'text-lg'}`}>
        {headline}
      </p>

      {showRoleFit && teaser.roleFitTrace ? (
        <div className="relative mt-3">
          <RoleFitStrip roleFit={teaser.roleFitTrace} compact={compact} />
        </div>
      ) : null}

      {teaser.projectHighlight ? (
        <p className={`relative mt-3 text-[#8a4609] ${compact ? 'line-clamp-2 text-sm' : 'text-[15px] leading-snug'}`}>
          {teaser.projectHighlight}
        </p>
      ) : null}

      {teaser.sourceBadges.length > 0 ? (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {teaser.sourceBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-md border border-black/8 bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-black/55"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}

      <p
        className={`relative mt-3 leading-relaxed text-black/80 ${
          compact ? 'line-clamp-3 text-sm' : 'text-[15px]'
        }`}
      >
        {teaser.visibleInsight}
      </p>

      {teaser.quantifiedSignals?.length ? (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {teaser.quantifiedSignals.map((signal) => (
            <span
              key={signal}
              className="rounded-full border border-[#ec9149]/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#9a4f0c]"
            >
              {signal}
            </span>
          ))}
        </div>
      ) : null}

      {teaser.locked ? (
        <div className="relative mt-4 overflow-hidden rounded-xl border border-black/[0.08] bg-white">
          <div className="space-y-0 divide-y divide-black/[0.05] px-3 py-1">
            {lockedRows.map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-center gap-2.5 py-2.5">
                <Lock className="h-3.5 w-3.5 shrink-0 text-black/25" />
                <span className="select-none text-[13px] text-black/55 blur-[3.5px]">{item}</span>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/90 to-transparent" />
          <div className="relative border-t border-black/[0.06] bg-white px-3 py-3">
            <p className="text-[13px] font-semibold text-[#050505]">
              Full Agent Trace is locked
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-black/45">
              See how they actually build with AI — sessions, tools, and role-specific interview prompts.
            </p>
            {onExpand ? (
              <button
                type="button"
                onClick={onExpand}
                className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ff7417] px-3.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(255,116,23,0.28)] transition hover:bg-[#e86810]"
              >
                Unlock full trace
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <p className="mt-2 text-[12px] font-medium text-[#b55f1b]">
                Upgrade to Growth to unlock
              </p>
            )}
          </div>
        </div>
      ) : onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          className={`relative mt-3 inline-flex items-center gap-1 font-semibold text-[#c56a12] hover:text-[#9a4f0c] ${
            compact ? 'text-[12px]' : 'text-[13px]'
          }`}
        >
          View full trace
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </section>
  );
};

export default AgentTraceTeaserSection;
