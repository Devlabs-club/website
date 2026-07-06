import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CardEyebrow, AnimatedBar, StaggerChip } from '../shared';
import { CARD_THEMES, BLUE, ORANGE } from '../theme';

export const StackCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const languages = report.languages.slice(0, 4);
  const frameworks = report.frameworks.slice(0, 8);

  return (
    <StoryCardShell theme={CARD_THEMES.stack} index={index} total={total}>
      <CardEyebrow>Your Stack</CardEyebrow>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="font-spinnaker text-3xl font-bold text-white sm:text-4xl"
      >
        Built in {languages[0]?.name || 'code'}.
      </motion.h2>

      <div className="mt-5 space-y-3">
        {languages.map((language, i) => (
          <AnimatedBar
            key={language.name}
            label={language.name}
            value={language.percent}
            color={i % 2 === 0 ? ORANGE : BLUE}
            delay={0.25 + i * 0.1}
          />
        ))}
      </div>

      {frameworks.length ? (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Frameworks &amp; tools</p>
          <div className="flex flex-wrap gap-2">
            {frameworks.map((framework, i) => (
              <StaggerChip key={framework.name} index={i}>
                {framework.name}
              </StaggerChip>
            ))}
          </div>
        </div>
      ) : null}
    </StoryCardShell>
  );
};

export default StackCard;
