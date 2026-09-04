import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { formatPeakHour, getReportUsage } from '@/lib/agentWrapped/usageDisplay';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';

export const RhythmCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const usage = getReportUsage(report);
  const peakHour = usage?.rhythm?.peakHour ?? 13;
  const peakLabel = formatPeakHour(peakHour);
  const weekdayPct = usage?.rhythm?.weekdayPct ?? 0;
  const weekendPct = usage?.rhythm?.weekendPct ?? 0;
  const buckets = usage?.rhythm?.hourBuckets || [];
  const maxBucket = useMemo(() => Math.max(...buckets, 1), [buckets]);
  const nightOwl = peakHour >= 22 || peakHour <= 4;

  return (
    <StoryCardShell theme={CARD_THEMES.rhythm} index={index} total={total}>
      <div className="flex h-full flex-col">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[3.2cqw] font-medium text-[#ff5700]">
          When are you most productive?
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mt-[2.5cqw] font-gatwick text-[12cqw] font-black leading-[0.92] tracking-[-0.05em] text-[#14110f]"
        >
          {nightOwl ? 'Night owl' : peakLabel.replace(':00 ', '')}
        </motion.p>
        <p className="mt-[3cqw] max-w-[92%] text-[3.1cqw] font-medium leading-[1.35] text-[#14110f]/70">
          Peak hour is {peakLabel}. {weekdayPct}% of sessions land on weekdays, {weekendPct}% on weekends.
        </p>

        <div className="mt-[4.5cqw] flex h-[12cqw] items-end gap-[0.4cqw]">
          {buckets.map((count, hour) => {
            const height = Math.max(10, (count / maxBucket) * 100);
            const isPeak = hour === peakHour;
            return (
              <motion.div
                key={hour}
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: 0.28 + hour * 0.01, duration: 0.35 }}
                className="flex-1"
                style={{ background: isPeak ? '#ff5700' : 'rgba(255,87,0,0.28)' }}
              />
            );
          })}
        </div>
      </div>
    </StoryCardShell>
  );
};

export default RhythmCard;
