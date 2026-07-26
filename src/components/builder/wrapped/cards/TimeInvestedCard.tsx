import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { isUploadedAgentWrappedReport } from '@/lib/agentWrapped/types';
import {
  hoursSupportLine,
  resolveDisplayTimeInvested,
} from '@/lib/agentWrapped/displayTimeInvested';
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
  if (digits >= 5) return 'text-[16cqw]';
  if (digits >= 4) return 'text-[18cqw]';
  if (digits === 3) return 'text-[20cqw]';
  if (digits === 2) return 'text-[22cqw]';
  return 'text-[24cqw]';
}

export const TimeInvestedCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const verified = isUploadedAgentWrappedReport(report);
  const timeInvested = resolveDisplayTimeInvested(report);
  const support = hoursSupportLine(timeInvested.totalHours);

  return (
    <StoryCardShell theme={CARD_THEMES.time} index={index} total={total} contentClassName="">
      <div className="relative h-full overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-[8%] top-[28%]"
        >
          <p className="font-gatwick text-[4.6cqw] font-bold leading-none text-white/85">you built for</p>
          <p
            className={`mt-[2cqw] font-gatwick font-black leading-[0.9] tracking-[-0.04em] text-white drop-shadow-[4px_5px_0_rgba(226,36,16,0.55)] ${hoursNumberClass(timeInvested.totalHours)}`}
          >
            <CountUp value={timeInvested.totalHours} decimals={timeInvested.totalHours < 10 ? 1 : 0} />
          </p>
          <p className="mt-[1.5cqw] font-gatwick text-[7.2cqw] font-bold leading-[1.05] text-white">
            hours
            <span className="mt-[0.4cqw] block text-[4.6cqw] font-bold text-white/90">with agents.</span>
          </p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42, duration: 0.45 }}
            className="mt-[4cqw] max-w-[90%] text-[3cqw] font-bold leading-[1.35] text-[#d4d4d4]"
          >
            {support}
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
