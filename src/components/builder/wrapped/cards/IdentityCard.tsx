import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CardEyebrow } from '../shared';
import { CARD_THEMES } from '../theme';

export const IdentityCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const identities = report.identities?.length
    ? report.identities
    : [{ name: 'Builder', tagline: 'Still writing your story.', score: 50 }];
  const [lead, ...rest] = identities;

  return (
    <StoryCardShell theme={CARD_THEMES.identity} index={index} total={total}>
      <CardEyebrow>Your Builder Identity</CardEyebrow>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-sm font-semibold text-white/70"
      >
        you're a
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 14, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="font-spinnaker text-5xl font-bold leading-[0.95] text-white sm:text-6xl"
      >
        {lead.name}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="mt-2 text-sm text-white/70"
      >
        {lead.tagline}
      </motion.p>

      {rest.length ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {rest.map((identity, i) => (
            <motion.div
              key={identity.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 + i * 0.12, duration: 0.4 }}
              className="rounded-xl border border-white/20 bg-white/[0.08] px-3 py-2"
            >
              <p className="text-xs font-black text-white">{identity.name}</p>
              <p className="text-[11px] text-white/55">{identity.tagline}</p>
            </motion.div>
          ))}
        </div>
      ) : null}
    </StoryCardShell>
  );
};

export default IdentityCard;
