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

  return (
    <StoryCardShell theme={CARD_THEMES.rhythm} index={index} total={total} contentClassName="">
      <div className="relative h-full overflow-hidden">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-0 top-[12%] font-gatwick text-[0.7rem] font-black uppercase tracking-[0.42em] text-white/75"
        >
          Coding rhythm
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-[6%] top-[20%]"
        >
          <p className="font-gatwick text-[4cqw] font-bold text-white/85">you code hardest at</p>
          <p className="mt-[2cqw] font-gatwick text-[14cqw] font-black leading-[0.9] tracking-[-0.04em] text-white drop-shadow-[5px_6px_0_rgba(80,220,150,0.55)]">
            {peakLabel.replace(':00 ', '')}
          </p>
          <p className="mt-[1.5cqw] text-[3cqw] font-bold text-white/80">peak local hour from agent logs</p>
        </motion.div>

        <div className="absolute bottom-[28%] left-0 right-[6%] flex h-[14cqw] items-end gap-[0.35cqw]">
          {buckets.map((count, hour) => {
            const height = Math.max(8, (count / maxBucket) * 100);
            const isPeak = hour === peakHour;
            return (
              <motion.div
                key={hour}
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: 0.35 + hour * 0.012, duration: 0.4 }}
                className="flex-1 rounded-t-[1px]"
                style={{ background: isPeak ? '#ffdc2e' : 'rgba(255,255,255,0.45)' }}
              />
            );
          })}
        </div>

        <div className="absolute bottom-[12%] left-0 right-[8%] grid grid-cols-2 gap-3">
          <div className="border border-white bg-white px-3 py-2 text-black shadow-[5px_5px_0_rgba(80,220,150,0.7)]">
            <p className="text-[2cqw] font-black uppercase tracking-[0.1em]">Weekday</p>
            <p className="font-gatwick text-[5.5cqw] font-black leading-none">{weekdayPct}%</p>
          </div>
          <div className="border border-white bg-white px-3 py-2 text-black shadow-[5px_5px_0_rgba(22,141,247,0.7)]">
            <p className="text-[2cqw] font-black uppercase tracking-[0.1em]">Weekend</p>
            <p className="font-gatwick text-[5.5cqw] font-black leading-none">{weekendPct}%</p>
          </div>
        </div>
      </div>
    </StoryCardShell>
  );
};

export default RhythmCard;
