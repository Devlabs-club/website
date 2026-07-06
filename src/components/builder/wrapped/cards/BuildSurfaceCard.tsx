import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CardEyebrow } from '../shared';
import { CountUp } from '../CountUp';
import { CARD_THEMES } from '../theme';

const LABELS: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  infra: 'Infra',
  tests: 'Tests',
  docs: 'Docs',
};

export const BuildSurfaceCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const entries = Object.entries(report.buildSurface).filter(([, value]) => typeof value === 'number');
  const top = [...entries].sort((a, b) => (b[1] as number) - (a[1] as number))[0];

  return (
    <StoryCardShell theme={CARD_THEMES.buildSurface} index={index} total={total}>
      <CardEyebrow>Build Surface</CardEyebrow>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="font-spinnaker text-3xl font-bold text-white sm:text-4xl"
      >
        {top ? LABELS[top[0]] : 'Full-stack'} heavy.
      </motion.h2>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {entries.map(([key, value], i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.25 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-white/15 bg-white/[0.08] p-3 backdrop-blur-sm"
          >
            <p className="text-[10px] font-black uppercase tracking-wide text-white/55">{LABELS[key] || key}</p>
            <p className="mt-1 font-spinnaker text-2xl font-bold text-white">
              <CountUp value={value as number} durationMs={700} />
              <span className="text-sm text-white/45">%</span>
            </p>
          </motion.div>
        ))}
      </div>
    </StoryCardShell>
  );
};

export default BuildSurfaceCard;
