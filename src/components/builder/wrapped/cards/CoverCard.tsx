import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';

export const CoverCard: React.FC<{ report: AgentWrappedReport; total: number }> = ({ report, total }) => (
  <StoryCardShell theme={CARD_THEMES.cover} index={1} total={total} contentClassName="">
    <div className="relative h-full overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="absolute left-0 right-0 top-[16%]"
      >
        <p className="font-gatwick text-[2.4cqw] font-black uppercase tracking-[0.48em] text-white/75">
          DevLabs AI Wrapped
        </p>
        <p className="mt-[1.2cqw] max-w-full text-[2.8cqw] font-normal leading-snug text-white/90 [overflow-wrap:anywhere]">
          {report.builderName || 'DevLabs Builder'}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.14, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="absolute left-0 right-[4%] top-[40%] -translate-y-1/2"
      >
        <h1 className="max-w-full font-gatwick text-[10.5cqw] font-black leading-[0.95] text-white drop-shadow-[4px_5px_0_rgba(222,32,19,0.72)]">
          how you
          <br />
          build
        </h1>
        <p className="mt-[3.5cqw] max-w-[78%] text-[3.1cqw] font-bold leading-[1.35] text-white">
          hours, tokens, models, and peak coding time — from your real agent logs.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.55, duration: 0.45 }}
        className="absolute bottom-[16%] left-0 right-[6%]"
      >
        <p className="inline-block max-w-full border border-white bg-white px-[2.2cqw] py-[1.2cqw] text-[2.1cqw] font-black uppercase tracking-[0.14em] text-black shadow-[5px_5px_0_rgba(225,41,18,0.92)]">
          DevLabs proof-of-work edition
        </p>
      </motion.div>

      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.45 }}
        className="absolute bottom-[8%] left-0 text-[2cqw] font-black uppercase tracking-[0.28em] text-white/70"
      >
        tap to begin →
      </motion.span>
    </div>
  </StoryCardShell>
);

export default CoverCard;
