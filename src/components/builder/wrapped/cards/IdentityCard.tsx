import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { isUploadedAgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';

export const IdentityCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const verified = isUploadedAgentWrappedReport(report);
  const fallbackIdentities = [
    { name: 'Builder', tagline: 'Still writing your story.', score: 50 },
    { name: 'Shipper', tagline: 'Keeps momentum visible.', score: 48 },
    { name: 'Debugger', tagline: 'Turns broken builds into proof.', score: 44 },
  ];
  const identities = report.identities?.length
    ? [...report.identities, ...(verified ? [] : fallbackIdentities)].slice(0, 3)
    : verified
      ? [{ name: report.archetype || 'Builder', tagline: report.founderRead?.summary || 'Verified agent usage uploaded.', score: report.score || 50 }]
      : fallbackIdentities;
  const [lead, ...rest] = identities;
  const leadSizeClass =
    lead.name.length > 11
      ? 'text-[3.05rem] sm:text-[3.55rem]'
      : lead.name.length > 8
        ? 'text-[3.55rem] sm:text-[4.2rem]'
        : 'text-[4.35rem] sm:text-[5.05rem]';

  return (
    <StoryCardShell theme={CARD_THEMES.identity} index={index} total={total} contentClassName="">
      <div className="relative h-full">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42 }}
          className="absolute left-0 top-[13%] font-gatwick text-[0.72rem] font-black uppercase tracking-[0.48em] text-white/75"
        >
          Final Reveal
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.45 }}
          className="absolute left-0 top-[26%] font-gatwick text-[2.1rem] font-black leading-none text-white"
        >
          you're a
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 24, scale: 0.88, rotate: -3 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: -3 }}
          transition={{ delay: 0.22, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute left-0 right-[6%] top-[33%] overflow-hidden text-ellipsis whitespace-nowrap font-gatwick font-black leading-[0.78] text-white drop-shadow-[7px_8px_0_rgba(226,36,16,0.82)] ${leadSizeClass}`}
        >
          {lead.name}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="absolute left-0 right-0 top-[55%] max-w-[20rem] font-normal text-[1.08rem] leading-tight text-white"
        >
          {lead.tagline}
        </motion.p>

        <div className="absolute bottom-[25%] left-0 right-[5%] grid grid-cols-2 gap-x-5 gap-y-4">
          {rest.slice(0, 2).map((identity, i) => (
            <motion.div
              key={identity.name}
              initial={{ opacity: 0, y: 18, rotate: i ? 3 : -3 }}
              animate={{ opacity: 1, y: 0, rotate: i ? 3 : -3 }}
              transition={{ delay: 0.68 + i * 0.14, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="min-w-0 border border-white bg-white px-4 py-3 text-black shadow-[6px_6px_0_rgba(250,125,34,0.85)]"
            >
              <p className="truncate font-gatwick text-lg font-black leading-none">{identity.name}</p>
              <p className="mt-2 max-w-[8.5rem] text-[0.62rem] font-bold leading-tight text-black/65">{identity.tagline}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.45 }}
          className="absolute bottom-[11%] left-0 right-[22%] border border-black/65 bg-white px-5 py-3.5 text-black shadow-[7px_7px_0_rgba(250,125,34,0.85)]"
        >
          <p className="text-[0.64rem] font-black uppercase leading-4 tracking-[0.18em]">download. share. flex the proof.</p>
        </motion.div>
      </div>
    </StoryCardShell>
  );
};

export default IdentityCard;
