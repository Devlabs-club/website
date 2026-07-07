import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { isUploadedAgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';

function heroTextSize(name: string, index: number) {
  const long = name.length > 10;
  const medium = name.length > 7;
  if (index === 0) {
    return long ? 'text-[1.85rem] sm:text-[2.15rem]' : medium ? 'text-[2.05rem] sm:text-[2.4rem]' : 'text-[2.25rem] sm:text-[2.65rem]';
  }
  if (index === 1) {
    return long ? 'text-[1.65rem] sm:text-[1.95rem]' : medium ? 'text-[1.85rem] sm:text-[2.15rem]' : 'text-[2rem] sm:text-[2.35rem]';
  }
  return long ? 'text-[1.55rem] sm:text-[1.85rem]' : medium ? 'text-[1.75rem] sm:text-[2.05rem]' : 'text-[1.9rem] sm:text-[2.2rem]';
}

export const StackCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const verified = isUploadedAgentWrappedReport(report);
  const languages = report.languages.slice(0, 5);
  const frameworks = report.frameworks.slice(0, 5);
  const tools = [
    report.sourceCoverage?.agents?.[0],
    report.sourceCoverage?.agents?.[1],
    report.validation?.buildTestLoops ? 'Tests' : null,
    report.buildSurface?.infra > 35 ? 'Infra' : null,
    report.buildSurface?.database > 35 ? 'Database' : null,
  ].filter(Boolean) as string[];
  const topTech = [...languages.map((item) => item.name), ...frameworks.map((item) => item.name)].slice(0, 3);
  const chipGroups = [
    { label: 'Languages', items: languages.map((item) => `${item.name} ${Math.round(item.percent)}%`) },
    { label: 'Frameworks', items: frameworks.map((item) => item.name) },
    {
      label: 'Tools',
      items: tools.length ? tools : verified ? ['No agent tools detected'] : ['Codex', 'Claude Code', 'Cursor'],
    },
  ];

  return (
    <StoryCardShell theme={CARD_THEMES.stack} index={index} total={total} contentClassName="">
      <div className="flex h-full min-h-0 flex-col">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42 }}
          className="shrink-0 font-gatwick text-[0.72rem] font-black uppercase tracking-[0.48em] text-white/75"
        >
          Your Stack
        </motion.p>

        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <div className="flex flex-col gap-3 sm:gap-4">
            {topTech.map((tech, i) => (
              <motion.p
                key={tech}
                initial={{ opacity: 0, x: i % 2 ? 26 : -26, rotate: i === 1 ? -2 : 1 }}
                animate={{ opacity: 1, x: 0, rotate: i === 1 ? -2 : 1 }}
                transition={{ delay: 0.12 + i * 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className={`shrink-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-gatwick font-black leading-tight text-white ${heroTextSize(tech, i)} ${
                  i === 1 ? 'ml-[8%]' : ''
                }`}
                style={{
                  textShadow: i === 1 ? '5px 5px 0 rgba(21,109,255,0.72)' : '5px 5px 0 rgba(236,47,22,0.72)',
                }}
              >
                {tech}
              </motion.p>
            ))}
          </div>

          <div className="mt-3 space-y-3.5 sm:mt-4">
            {chipGroups.map((group, groupIndex) => (
              <motion.div
                key={group.label}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42 + groupIndex * 0.1, duration: 0.45 }}
              >
                <p className="mb-2 font-gatwick text-[0.62rem] font-black uppercase tracking-[0.32em] text-white/58">
                  {group.label}
                </p>
                <div className="flex max-w-full flex-wrap gap-2">
                  {group.items.slice(0, groupIndex === 0 ? 4 : 5).map((item, i) => (
                    <motion.span
                      key={`${group.label}-${item}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.48 + groupIndex * 0.1 + i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="inline-flex max-w-[9.25rem] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-white/70 bg-black/35 px-3 py-1.5 text-[0.78rem] font-black text-white shadow-[5px_5px_0_rgba(250,125,34,0.75)] sm:text-sm"
                    >
                      {item}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </StoryCardShell>
  );
};

export default StackCard;
