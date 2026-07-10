import React from 'react';
import { AlertTriangle, ChevronRight, Sparkles } from 'lucide-react';
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

export const AgentTraceTeaserSection: React.FC<Props> = ({ teaser, compact, onExpand, showRoleFit = true }) => (
  <section className={`rounded-2xl border border-[#ec9149]/30 bg-[#fff7ef] ${compact ? 'p-3' : 'p-4 mb-6'}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#9a4f0c]">
        {teaser.hasAgentWrapped ? 'Agent Wrapped' : teaser.locked ? 'Agent trace preview' : 'Agent trace'}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {teaser.hasAgentWrapped ? (
          <span className="rounded-full border border-[#ec9149]/30 bg-white px-2 py-0.5 text-[10px] font-semibold text-[#9a4f0c]">
            Verified
          </span>
        ) : (
          <span className="rounded-full border border-black/10 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-black/45">
            Profile estimate
          </span>
        )}
        {typeof teaser.wrappedScore === 'number' ? (
          <span className="rounded-full border border-[#ec9149]/30 bg-white px-2 py-0.5 text-[10px] font-semibold text-[#9a4f0c]">
            Founder fit {teaser.wrappedScore}/100
          </span>
        ) : null}
        {teaser.traceFreshness?.label ? (
          <span className={`text-[10px] font-medium ${teaser.traceFreshness.isFresh ? 'text-black/45' : 'text-amber-700'}`}>
            {teaser.traceFreshness.label}
            {teaser.traceFreshness.sessionCount ? ` · ${teaser.traceFreshness.sessionCount} sessions` : ''}
          </span>
        ) : null}
      </div>
    </div>

    {teaser.archetype ? (
      <p className={`mb-1 font-semibold text-black ${compact ? 'text-sm' : 'text-base'}`}>{teaser.archetype}</p>
    ) : (
      <p className={`mb-1 font-medium text-black/70 ${compact ? 'text-xs' : 'text-sm'}`}>{teaser.label}</p>
    )}

    {showRoleFit && teaser.roleFitTrace ? (
      <div className={`mb-2 rounded-xl border border-[#ec9149]/20 bg-white/70 ${compact ? 'p-2' : 'p-2.5'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9a4f0c]">For this role</p>
          <span className="text-[10px] font-semibold text-[#c56a12]">
            {teaser.roleFitTrace.alignmentScore}% trace alignment
          </span>
        </div>
        <p className={`mt-1 text-black/75 ${compact ? 'text-[11px] line-clamp-2' : 'text-xs'}`}>
          {teaser.roleFitTrace.roleSummary}
        </p>
        {!compact && teaser.roleFitTrace.relevantSignals.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {teaser.roleFitTrace.relevantSignals.slice(0, 2).map((signal) => (
              <span key={signal} className="rounded-md bg-[#fff7ef] px-1.5 py-0.5 text-[10px] text-[#8a4609]">
                {signal}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    ) : null}

    {teaser.bestFitRoles?.length ? (
      <p className={`mb-2 text-black/70 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        Best fit: {teaser.bestFitRoles.join(' · ')}
      </p>
    ) : null}

    {teaser.projectHighlight ? (
      <p className={`mb-2 font-medium italic text-[#8a4609] ${compact ? 'text-[11px] line-clamp-2' : 'text-xs'}`}>
        {teaser.projectHighlight}
      </p>
    ) : null}

    {teaser.sourceBadges.length > 0 ? (
      <div className="mb-2 flex flex-wrap gap-1.5">
        {teaser.sourceBadges.map((badge) => (
          <span key={badge} className="rounded-md border border-[#ece7e1] bg-white px-2 py-0.5 text-[10px] font-semibold text-black/70">
            {badge}
          </span>
        ))}
      </div>
    ) : null}

    <p className={`leading-relaxed text-black/80 ${compact ? 'text-xs line-clamp-3' : 'text-sm'}`}>
      {teaser.visibleInsight}
    </p>

    {teaser.quantifiedSignals?.length ? (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {teaser.quantifiedSignals.map((signal) => (
          <span
            key={signal}
            className="rounded-full border border-[#ec9149]/35 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-[#9a4f0c]"
          >
            {signal}
          </span>
        ))}
      </div>
    ) : null}

    {teaser.visibleRiskFlags?.length ? (
      <div className="mt-2 space-y-1">
        {teaser.visibleRiskFlags.slice(0, compact ? 1 : 2).map((flag) => (
          <div key={flag} className="flex items-start gap-1.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{flag}</span>
          </div>
        ))}
      </div>
    ) : null}

    {teaser.locked && teaser.redacted.length > 0 ? (
      <div className="mt-2 space-y-1">
        {teaser.redacted.slice(0, compact ? 2 : 3).map((item) => (
          <div key={item} className="flex items-center gap-2 text-[11px] text-black/35">
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
            <span className="blur-[2px] select-none">{item}</span>
          </div>
        ))}
        <p className="pt-1 text-[11px] text-black/45">Upgrade to Growth to unlock the full Agent Wrapped trace.</p>
      </div>
    ) : null}

    {onExpand ? (
      <button
        type="button"
        onClick={onExpand}
        className={`mt-2 inline-flex items-center gap-1 font-semibold text-[#c56a12] hover:text-[#9a4f0c] ${compact ? 'text-[11px]' : 'text-xs'}`}
      >
        <Sparkles className="h-3 w-3" />
        {teaser.locked ? 'Unlock full trace' : 'View full trace'}
        <ChevronRight className="h-3 w-3" />
      </button>
    ) : null}
  </section>
);

export default AgentTraceTeaserSection;
