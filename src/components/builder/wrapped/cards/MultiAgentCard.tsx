import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { isUploadedAgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';
import { CountUp } from '../CountUp';

const AGENT_COLORS: Record<string, string> = {
  'Claude Code': '#fa7d22',
  Codex: '#168df7',
  Cursor: '#50dc96',
  'Manual import': 'rgba(255,255,255,0.4)',
};

function agentColor(agent: string) {
  return AGENT_COLORS[agent] || '#ffce54';
}

const AGENT_ORDER = ['Codex', 'Claude Code', 'Cursor'];

export const MultiAgentCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const split = (report.agentSplit || [])
    .filter((item) => item.percent > 0)
    .sort((a, b) => b.percent - a.percent);
  const verified = isUploadedAgentWrappedReport(report);
  const displaySplit = (verified ? split : split.length ? split : [
    { agent: 'Codex', percent: 42 },
    { agent: 'Claude Code', percent: 34 },
    { agent: 'Cursor', percent: 24 },
  ]).sort((a, b) => {
    const aIndex = AGENT_ORDER.indexOf(a.agent);
    const bIndex = AGENT_ORDER.indexOf(b.agent);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
  const normalizedTotal = displaySplit.reduce((sum, item) => sum + item.percent, 0) || 100;
  const segments = displaySplit.map((item) => ({ ...item, width: (item.percent / normalizedTotal) * 100 }));

  return (
    <StoryCardShell theme={CARD_THEMES.agents} index={index} total={total} contentClassName="">
      <div className="relative h-full">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42 }}
          className="absolute left-0 top-[13%] font-gatwick text-[0.72rem] font-black uppercase tracking-[0.48em] text-white/75"
        >
          Multi-Agent Split
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-0 top-[20%] font-gatwick text-[3.2rem] font-black leading-[0.95] text-white drop-shadow-[6px_6px_0_rgba(22,141,247,0.76)] sm:text-[3.85rem]"
        >
          your agent
          <br />
          bench was
          <br />
          stacked.
        </motion.h2>

        <div className="absolute left-0 right-[11%] top-[50%]">
          <div className="relative h-16 overflow-hidden border-2 border-white bg-black shadow-[9px_9px_0_rgba(255,220,46,0.82)]">
            <div className="flex h-full">
              {segments.map((segment, i) => (
                <motion.div
                  key={segment.agent}
                  initial={{ width: 0 }}
                  animate={{ width: `${segment.width}%` }}
                  transition={{ delay: 0.34 + i * 0.12, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="relative h-full overflow-hidden"
                  style={{ background: agentColor(segment.agent) }}
                >
                  <div className="absolute inset-0 opacity-35 mix-blend-overlay [background-image:linear-gradient(135deg,rgba(255,255,255,.9)_0_1px,transparent_1px)] [background-size:8px_8px]" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute left-0 right-[11%] top-[66%] space-y-4 sm:space-y-5">
          {segments.map((segment, i) => (
            <motion.div
              key={`label-${segment.agent}`}
              initial={{ opacity: 0, x: i % 2 ? 22 : -22, rotate: i % 2 ? 2 : -2 }}
              animate={{ opacity: 1, x: 0, rotate: i % 2 ? 1.4 : -1.4 }}
              transition={{ delay: 0.72 + i * 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex min-w-0 items-center justify-between gap-3 border border-white bg-white px-3 py-2 text-black shadow-[6px_6px_0_rgba(220,39,16,0.88)]"
            >
              <span className="min-w-0 text-[0.78rem] font-black uppercase leading-snug tracking-[0.08em] [overflow-wrap:anywhere]">
                {segment.agent}
              </span>
              <span className="shrink-0 font-gatwick text-[1.42rem] font-black leading-none">
                <CountUp value={segment.percent} durationMs={700} />%
              </span>
            </motion.div>
          ))}
          {!verified && !split.length ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-[0.62rem] font-black uppercase leading-tight tracking-[0.14em] text-white/68"
              >
                sample split shown until your agent trace is uploaded
              </motion.div>
          ) : verified && !split.length ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-[0.62rem] font-black uppercase leading-tight tracking-[0.14em] text-white/68"
              >
                no multi-agent split detected in uploaded trace
              </motion.div>
          ) : null}
        </div>
      </div>
    </StoryCardShell>
  );
};

export default MultiAgentCard;
