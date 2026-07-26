import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import {
  formatTokenCount,
  formatUsd,
  getReportUsage,
} from '@/lib/agentWrapped/usageDisplay';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';

function tokensNumberClass(label: string) {
  const len = label.length;
  if (len >= 6) return 'text-[14cqw]';
  if (len >= 5) return 'text-[16cqw]';
  if (len >= 4) return 'text-[18cqw]';
  return 'text-[20cqw]';
}

export const TokensCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const usage = getReportUsage(report);
  const totalTokens = usage?.tokens?.total || 0;
  const label = formatTokenCount(totalTokens);
  const work = usage?.tokens?.work || 0;
  const cache = usage?.tokens?.cache || 0;
  const workPct = totalTokens > 0 ? Math.round((work / totalTokens) * 100) : 0;
  const cachePct = Math.max(0, 100 - workPct);
  const cost = formatUsd(usage?.tokens?.retailCostUsd);
  const byAgent = (usage?.tokens?.byAgent || []).filter((row) => row.total > 0).slice(0, 3);
  const maxAgent = Math.max(...byAgent.map((row) => row.total), 1);

  return (
    <StoryCardShell theme={CARD_THEMES.tokens} index={index} total={total} contentClassName="">
      <div className="relative h-full overflow-hidden">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute left-0 top-[12%] font-gatwick text-[0.7rem] font-black uppercase tracking-[0.42em] text-white/75"
        >
          Token burn
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-[6%] top-[20%]"
        >
          <p className="font-gatwick text-[4.2cqw] font-bold leading-none text-white/85">
            you burned
          </p>
          <p
            className={`mt-[1.5cqw] font-gatwick font-black leading-[0.9] tracking-[-0.04em] text-white drop-shadow-[4px_5px_0_rgba(226,36,16,0.55)] ${tokensNumberClass(label)}`}
          >
            {label}
          </p>
          <p className="mt-[1.2cqw] font-gatwick text-[6.4cqw] font-bold leading-[1.05] text-white">
            tokens
            <span className="mt-[0.3cqw] block text-[3.8cqw] font-bold text-white/88">
              with agents.
            </span>
          </p>
          {cost ? (
            <p className="mt-[2.5cqw] text-[2.8cqw] font-bold text-[#ffb84d]">
              ~{cost} retail token value
            </p>
          ) : null}
        </motion.div>

        <div className="absolute bottom-[22%] left-0 right-[8%] space-y-3">
          <div className="overflow-hidden border border-white/80 bg-black/50 shadow-[6px_6px_0_rgba(250,125,34,0.75)]">
            <div className="flex h-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${workPct}%` }}
                transition={{ delay: 0.45, duration: 0.7 }}
                className="h-full bg-[#fa7d22]"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${cachePct}%` }}
                transition={{ delay: 0.55, duration: 0.7 }}
                className="h-full bg-[#ffdc2e]"
              />
            </div>
            <div className="flex justify-between px-3 py-2 text-[2.2cqw] font-bold uppercase tracking-[0.08em] text-white/85">
              <span>fresh {workPct}%</span>
              <span>cache {cachePct}%</span>
            </div>
          </div>

          {byAgent.map((row, i) => (
            <motion.div
              key={row.agent}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.65 + i * 0.08 }}
              className="flex items-center gap-2"
            >
              <span className="w-[28%] truncate text-[2.3cqw] font-black uppercase tracking-[0.06em] text-white/80">
                {row.agent}
              </span>
              <div className="h-2 flex-1 overflow-hidden bg-white/15">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(row.total / maxAgent) * 100}%` }}
                  transition={{ delay: 0.7 + i * 0.08, duration: 0.55 }}
                  className="h-full bg-white"
                />
              </div>
              <span className="w-[18%] text-right font-gatwick text-[2.6cqw] font-black text-white">
                {formatTokenCount(row.total)}
              </span>
            </motion.div>
          ))}
        </div>

        {usage?.tokens?.cursorEstimated ? (
          <p className="absolute bottom-[9%] left-0 right-0 text-center text-[1.7cqw] font-normal uppercase tracking-[0.08em] text-white/30">
            includes Cursor tokens estimated from active time
          </p>
        ) : null}
      </div>
    </StoryCardShell>
  );
};

export default TokensCard;
