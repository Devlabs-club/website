import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CardEyebrow, CalloutPill } from '../shared';
import { CountUp } from '../CountUp';
import { CARD_THEMES } from '../theme';

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export const TimeInvestedCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const timeInvested = report.timeInvested || { totalHours: 0, longestSessionMinutes: 0, estimated: true };
  const days = Math.max(1, Math.round(timeInvested.totalHours / 24));

  return (
    <StoryCardShell theme={CARD_THEMES.time} index={index} total={total}>
      <CardEyebrow>Time Invested</CardEyebrow>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="text-lg font-bold text-white/90"
      >
        you built for{' '}
        <span className="font-spinnaker text-5xl font-bold leading-none text-white sm:text-6xl">
          <CountUp value={timeInvested.totalHours} decimals={timeInvested.totalHours < 10 ? 1 : 0} />
        </span>{' '}
        <span className="align-top text-lg">hours</span> this year.
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.45 }}
        className="mt-3 text-sm font-semibold text-white/70"
      >
        that's {days} straight day{days === 1 ? '' : 's'} of shipping
      </motion.p>

      <div className="mt-6">
        <CalloutPill delay={0.6}>longest single session: {formatMinutes(timeInvested.longestSessionMinutes)}</CalloutPill>
      </div>

      {timeInvested.estimated ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
          className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/40"
        >
          estimated from available proof-of-work
        </motion.p>
      ) : null}
    </StoryCardShell>
  );
};

export default TimeInvestedCard;
