import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import type { RoleFitTracePayload } from '@/lib/talent/roleFitTrace';
import CoverCard from '@/components/builder/wrapped/cards/CoverCard';
import StackCard from '@/components/builder/wrapped/cards/StackCard';
import BuildSurfaceCard from '@/components/builder/wrapped/cards/BuildSurfaceCard';
import IdentityCard from '@/components/builder/wrapped/cards/IdentityCard';

const FOUNDER_CARD_ORDER = ['cover', 'stack', 'buildSurface', 'identity'] as const;
type FounderCardKey = (typeof FOUNDER_CARD_ORDER)[number];

type Props = {
  report: AgentWrappedReport;
  roleFitTrace?: RoleFitTracePayload | null;
  interviewProbes?: string[];
};

export const FounderTraceViewer: React.FC<Props> = ({ report, roleFitTrace, interviewProbes }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const total = FOUNDER_CARD_ORDER.length;

  const goTo = useCallback(
    (next: number) => setActiveIndex(Math.max(0, Math.min(total - 1, next))),
    [total]
  );

  const renderCard = () => {
    const key = FOUNDER_CARD_ORDER[activeIndex];
    const props = { report, index: activeIndex + 1, total } as const;
    switch (key) {
      case 'cover':
        return <CoverCard report={report} total={total} />;
      case 'stack':
        return <StackCard {...props} />;
      case 'buildSurface':
        return <BuildSurfaceCard {...props} />;
      case 'identity':
        return <IdentityCard {...props} />;
      default:
        return null;
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div>
        <div className="mb-2 flex gap-1">
          {FOUNDER_CARD_ORDER.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => goTo(i)}
              className={`h-1 flex-1 rounded-full transition ${i === activeIndex ? 'bg-[#ec9149]' : i < activeIndex ? 'bg-[#ec9149]/40' : 'bg-black/10'}`}
              aria-label={`Go to ${key} card`}
            />
          ))}
        </div>
        <div className="relative mx-auto w-full max-w-[min(400px,calc(100vw-4rem))]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {renderCard()}
            </motion.div>
          </AnimatePresence>
          <button
            type="button"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ece7e1] bg-white p-1.5 text-black/60 shadow-sm hover:bg-[#fff7ef] disabled:opacity-30"
            aria-label="Previous card"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex === total - 1}
            className="absolute right-0 top-1/2 z-10 translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ece7e1] bg-white p-1.5 text-black/60 shadow-sm hover:bg-[#fff7ef] disabled:opacity-30"
            aria-label="Next card"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-black/40">
          {activeIndex + 1} / {total} · Read-only founder view
        </p>
      </div>

      <aside className="space-y-3">
        {roleFitTrace ? (
          <div className="rounded-xl border border-[#ec9149]/25 bg-[#fff7ef] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9a4f0c]">Role fit</p>
            <p className="mt-1 text-2xl font-semibold text-black">{roleFitTrace.alignmentScore}%</p>
            <p className="mt-1 text-xs text-black/65 leading-relaxed">{roleFitTrace.roleSummary}</p>
            {roleFitTrace.gaps.length > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-black/40">Gaps to validate</p>
                {roleFitTrace.gaps.map((gap) => (
                  <p key={gap} className="text-[11px] text-amber-800">
                    {gap}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {interviewProbes?.length ? (
          <div className="rounded-xl border border-[#ece7e1] bg-[#fffcfa] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-black/40">Ask in intro</p>
            <ul className="mt-2 space-y-2">
              {interviewProbes.slice(0, 3).map((probe) => (
                <li key={probe} className="text-[11px] leading-relaxed text-black/70">
                  {probe}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {report.percentile != null ? (
          <div className="rounded-xl border border-[#ece7e1] bg-white p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-black/40">Builder percentile</p>
            <p className="mt-1 text-lg font-semibold text-black">Top {100 - report.percentile}%</p>
            <p className="text-[11px] text-black/45">on validation discipline</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
};

export default FounderTraceViewer;
