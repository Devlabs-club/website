import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CardEyebrow } from '../shared';
import { CARD_THEMES } from '../theme';

const AGENT_COLORS: Record<string, string> = {
  'Claude Code': '#fa7d22',
  Codex: '#168df7',
  Cursor: '#50dc96',
  'Manual import': 'rgba(255,255,255,0.4)',
};

function agentColor(agent: string) {
  return AGENT_COLORS[agent] || '#ffce54';
}

export const MultiAgentCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const split = (report.agentSplit || []).filter((item) => item.percent > 0);
  const r = 42;
  const cx = 50;
  const cy = 50;

  let cumulative = 0;
  const segments = split.map((item) => {
    const start = cumulative;
    cumulative += item.percent / 100;
    return { ...item, start, length: item.percent / 100 };
  });

  return (
    <StoryCardShell theme={CARD_THEMES.agents} index={index} total={total}>
      <CardEyebrow>Multi-Agent Split</CardEyebrow>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-4 font-spinnaker text-3xl font-bold text-white sm:text-4xl"
      >
        {split.length > 1 ? 'You run a squad.' : 'One agent, deep.'}
      </motion.h2>

      {split.length ? (
        <div className="flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-0">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
            {segments.map((segment, i) => (
              <motion.circle
                key={segment.agent}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={agentColor(segment.agent)}
                strokeWidth="12"
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ pathOffset: segment.start }}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: segment.length }}
                transition={{ duration: 0.9, delay: 0.3 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </svg>
          <div className="flex-1 space-y-2">
            {segments.map((segment, i) => (
              <motion.div
                key={segment.agent}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.4 }}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-1.5 font-semibold text-white/90">
                  <span className="h-2 w-2 rounded-full" style={{ background: agentColor(segment.agent) }} />
                  {segment.agent}
                </span>
                <span className="font-spinnaker font-bold text-white/70">{segment.percent}%</span>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="rounded-xl border border-white/15 bg-white/[0.06] p-4 text-sm leading-6 text-white/70"
        >
          No agent trace connected yet. Run the local analysis to see your Claude Code / Codex / Cursor split.
        </motion.div>
      )}
    </StoryCardShell>
  );
};

export default MultiAgentCard;
