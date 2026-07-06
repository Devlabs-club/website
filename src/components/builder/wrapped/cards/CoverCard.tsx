import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CardEyebrow } from '../shared';
import { CARD_THEMES } from '../theme';

export const CoverCard: React.FC<{ report: AgentWrappedReport; total: number }> = ({ report, total }) => (
  <StoryCardShell theme={CARD_THEMES.cover} index={1} total={total}>
    <CardEyebrow>DevLabs Builder Wrapped</CardEyebrow>

    <motion.h1
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="font-spinnaker text-[2.6rem] font-bold leading-[0.98] text-white sm:text-5xl"
    >
      Your 2026,
      <br />
      shipped.
    </motion.h1>

    <motion.p
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.5 }}
      className="mt-4 text-base font-semibold text-white/85"
    >
      {report.builderName || 'DevLabs Builder'}
    </motion.p>
    <motion.p
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.5 }}
      className="text-sm text-white/55"
    >
      {report.archetype}
    </motion.p>

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9, duration: 0.6 }}
      className="mt-8 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50"
    >
      <motion.span
        animate={{ x: [0, 6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        tap to begin →
      </motion.span>
    </motion.div>
  </StoryCardShell>
);

export default CoverCard;
