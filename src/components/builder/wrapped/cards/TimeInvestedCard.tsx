import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { isUploadedAgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CountUp } from '../CountUp';
import { CARD_THEMES } from '../theme';

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function hoursNumberClass(hours: number) {
  const digits = String(Math.round(hours)).length;
  if (digits >= 3) return 'text-[13.8cqw]';
  if (digits === 2) return 'text-[14.8cqw]';
  return 'text-[15.5cqw]';
}

function sessionCountFor(report: AgentWrappedReport) {
  return (
    report.sourceCoverage?.sessionCount ||
    (report.sourceSummary.claudeSessions || 0) +
      (report.sourceSummary.codexSessions || 0) +
      (report.sourceSummary.cursorSessions || 0) +
      (report.sourceSummary.manualImports || 0)
  );
}

function almostDaysStraight(hours: number) {
  const days = hours / 24;
  if (days < 1) return 'almost a full day straight';
  const rounded = Math.max(1, Math.round(days));
  if (rounded === 1) return 'almost 1 day straight';
  return `almost ${rounded} days straight`;
}

export const TimeInvestedCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const verified = isUploadedAgentWrappedReport(report);
  const sessionCount = sessionCountFor(report);
  const fallbackHours = Math.max(24, Math.round(sessionCount * 1.45));
  const rawTimeInvested = report.timeInvested || { totalHours: 0, longestSessionMinutes: 0, estimated: true };
  const timeInvested = {
    totalHours:
      rawTimeInvested.totalHours > 0
        ? rawTimeInvested.totalHours
        : verified
          ? Math.max(fallbackHours, Math.round(sessionCount * 0.75))
          : fallbackHours,
    longestSessionMinutes:
      rawTimeInvested.longestSessionMinutes > 0
        ? rawTimeInvested.longestSessionMinutes
        : verified
          ? Math.min(402, Math.max(58, Math.round((rawTimeInvested.totalHours || fallbackHours) * 7 / Math.max(sessionCount, 1))))
          : Math.min(402, Math.max(58, Math.round(fallbackHours * 7))),
    estimated: verified
      ? rawTimeInvested.estimated !== false || rawTimeInvested.totalHours <= 0
      : rawTimeInvested.estimated || rawTimeInvested.totalHours <= 0,
  };
  const introClass = 'text-[5.35cqw] font-bold leading-[1.4]';
  const support = almostDaysStraight(timeInvested.totalHours);

  return (
    <StoryCardShell theme={CARD_THEMES.time} index={index} total={total} contentClassName="">
      <div className="relative h-full overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-[-1.1%] right-[20%] top-[33.5%] max-w-full"
        >
          <div className="flex max-w-full flex-nowrap items-end gap-x-[0.8cqw] text-white">
            <span className={`shrink-0 self-end ${introClass}`}>you built for</span>
            <span className={`self-end font-bold leading-none ${hoursNumberClass(timeInvested.totalHours)}`}>
              <CountUp value={timeInvested.totalHours} decimals={timeInvested.totalHours < 10 ? 1 : 0} />
            </span>
          </div>

          <div className="mt-[0.35cqw] flex max-w-full items-baseline gap-x-[0.8cqw]">
            <span className={`invisible shrink-0 ${introClass}`} aria-hidden="true">
              you built for
            </span>
            <span className="-ml-[1.2cqw] text-[8.1cqw] font-bold leading-[1.4] text-white">hours</span>
          </div>

          <div className="mt-[0.2cqw] flex max-w-full items-baseline gap-x-[0.8cqw]">
            <span className={`invisible shrink-0 ${introClass}`} aria-hidden="true">
              you built for
            </span>
            <span className="ml-[2.4cqw] text-[4.85cqw] font-bold leading-[1.4] text-white">with agents.</span>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42, duration: 0.45 }}
            className="mt-[4.8cqw] max-w-full text-[3.05cqw] font-bold leading-[1.4] text-[#d4d4d4]"
          >
            that's {support}
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute bottom-[16.5%] left-0 right-0 border border-black/40 bg-white px-[3.5cqw] py-[1.35cqw] text-center text-[2.65cqw] font-normal leading-[1.4] text-[#000000] shadow-[7px_7px_0_#e22710]"
        >
          longest single session: {formatMinutes(timeInvested.longestSessionMinutes)}
        </motion.div>

        {timeInvested.estimated ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85 }}
            className="absolute bottom-[10%] left-0 right-0 text-center text-[1.75cqw] font-normal uppercase tracking-[0.08em] text-white/28"
          >
            {verified
              ? 'estimated from local session files and timestamps'
              : 'estimated from available proof-of-work'}
          </motion.p>
        ) : null}
      </div>
    </StoryCardShell>
  );
};

export default TimeInvestedCard;
