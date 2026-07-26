import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { getReportUsage } from '@/lib/agentWrapped/usageDisplay';
import { StoryCardShell } from '../StoryCardShell';
import { CountUp } from '../CountUp';
import { CARD_THEMES } from '../theme';

export const ModelsCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const usage = getReportUsage(report);
  const models = usage?.models || [];
  const top = models[0];
  const rest = models.slice(1, 4);

  return (
    <StoryCardShell theme={CARD_THEMES.models} index={index} total={total} contentClassName="">
      <div className="relative h-full overflow-hidden">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-0 top-[12%] font-gatwick text-[0.7rem] font-black uppercase tracking-[0.42em] text-white/75"
        >
          Model crown
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-[8%] top-[22%]"
        >
          <p className="font-gatwick text-[4cqw] font-bold text-white/85">your top model was</p>
          <p className="mt-[2cqw] font-gatwick text-[11cqw] font-black leading-[0.92] tracking-[-0.04em] text-white drop-shadow-[5px_6px_0_rgba(22,141,247,0.7)]">
            {top?.id || '—'}
          </p>
          {top ? (
            <p className="mt-[2cqw] font-gatwick text-[8cqw] font-black text-[#ffdc2e]">
              <CountUp value={top.percent} />%
              <span className="ml-2 text-[3.4cqw] font-bold text-white/75">of sessions</span>
            </p>
          ) : null}
        </motion.div>

        <div className="absolute bottom-[14%] left-0 right-[10%] space-y-3">
          {rest.map((model, i) => (
            <motion.div
              key={model.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 + i * 0.1 }}
              className="flex items-center justify-between border border-white bg-white px-3 py-2 text-black shadow-[6px_6px_0_rgba(22,141,247,0.75)]"
            >
              <span className="text-[2.6cqw] font-black uppercase tracking-[0.06em]">{model.id}</span>
              <span className="font-gatwick text-[4cqw] font-black">{model.percent}%</span>
            </motion.div>
          ))}
        </div>
      </div>
    </StoryCardShell>
  );
};

export default ModelsCard;
