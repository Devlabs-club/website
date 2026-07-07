import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CountUp } from '../CountUp';
import { CARD_THEMES } from '../theme';

function powerStack(report: AgentWrappedReport) {
  const topLanguage = report.languages?.[0]?.name || 'Code';
  const topFramework = report.frameworks?.[0]?.name || null;
  const topAgent = report.agentSplit?.[0]?.agent || report.sourceCoverage?.agents?.[0] || 'Agents';
  const agentCount = report.sourceCoverage?.agents?.length || report.agentSplit?.length || 1;
  const languageCount = report.languages?.length || 1;
  const frameworkCount = report.frameworks?.length || 0;
  const percentile = report.percentile;

  const headline =
    agentCount >= 3
      ? { line1: 'multi-agent', line2: 'operator.' }
      : topFramework
        ? { line1: `${topLanguage} ×`, line2: `${topFramework}.` }
        : { line1: `${topLanguage} ×`, line2: `${topAgent}.` };

  const flexStats = [
    {
      key: 'agent',
      label: 'Go-to agent',
      value: topAgent,
      isText: true,
    },
    {
      key: 'languages',
      label: 'Languages',
      value: languageCount,
      suffix: languageCount === 1 ? ' stack' : ' stacks',
      isText: false,
    },
    {
      key: 'frameworks',
      label: 'Frameworks',
      value: frameworkCount,
      suffix: frameworkCount === 1 ? ' locked in' : ' in play',
      isText: false,
    },
    {
      key: 'agents',
      label: 'Agent bench',
      value: agentCount,
      suffix: agentCount === 1 ? ' tool' : ' tools',
      isText: false,
    },
    {
      key: 'fit',
      label: 'Founder fit',
      value: report.score ?? 0,
      suffix: '/100',
      isText: false,
    },
    {
      key: 'rank',
      label: 'Builder rank',
      value: percentile ? `Top ${percentile}%` : 'Rising',
      isText: true,
    },
  ];

  return { headline, flexStats, topLanguage, topAgent, topFramework };
}

export const BuildSurfaceCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const { headline, flexStats, topLanguage, topAgent } = powerStack(report);

  return (
    <StoryCardShell theme={CARD_THEMES.buildSurface} index={index} total={total} contentClassName="">
      <div className="relative h-full">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42 }}
          className="absolute left-0 top-[13%] font-gatwick text-[0.72rem] font-black uppercase tracking-[0.48em] text-white/75"
        >
          Your Power Stack
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-[4%] top-[20%] font-gatwick text-[3rem] font-black leading-[0.95] text-white drop-shadow-[6px_6px_0_rgba(226,38,16,0.72)] sm:text-[3.55rem]"
        >
          {headline.line1}
          <br />
          {headline.line2}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.45 }}
          className="absolute left-0 right-[10%] top-[38%] text-[1.05rem] font-bold leading-tight text-white/88 sm:text-[1.15rem]"
        >
          {topLanguage} builder who ships through {topAgent}.
        </motion.p>

        <div className="absolute left-0 right-[5%] top-[46%] bottom-[8%]">
          <div className="grid grid-cols-2 gap-x-[2.2cqw] gap-y-[2.4cqw] sm:grid-cols-3">
            {flexStats.map((stat, i) => (
              <motion.div
                key={stat.key}
                initial={{ opacity: 0, y: 18, rotate: i % 2 ? 2 : -2 }}
                animate={{ opacity: 1, y: 0, rotate: i % 2 ? 1.5 : -1.5 }}
                transition={{ delay: 0.38 + i * 0.07, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className="min-w-0 border border-white bg-white px-[1.8cqw] py-[1.6cqw] text-black shadow-[5px_5px_0_rgba(227,39,15,0.85)]"
              >
                <p className="truncate text-[0.5rem] font-black uppercase tracking-[0.06em]">{stat.label}</p>
                <p className="mt-[0.4cqw] truncate font-gatwick text-[1.05rem] font-black leading-none sm:text-[1.2rem]">
                  {stat.isText ? (
                    stat.value
                  ) : (
                    <>
                      <CountUp value={typeof stat.value === 'number' ? stat.value : 0} durationMs={700} />
                      {stat.suffix}
                    </>
                  )}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.82, duration: 0.45 }}
            className="mt-[4cqw] border border-black/50 bg-[#ffdd24] px-[2.4cqw] py-[1.4cqw] text-center shadow-[6px_6px_0_rgba(0,0,0,0.85)]"
          >
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-black/70">the combo founders remember</p>
            <p className="mt-1 font-gatwick text-[1.35rem] font-black leading-tight text-black sm:text-[1.55rem]">
              {topLanguage} · {topAgent}
              {report.frameworks?.[0]?.name ? ` · ${report.frameworks[0].name}` : ''}
            </p>
          </motion.div>
        </div>
      </div>
    </StoryCardShell>
  );
};

export default BuildSurfaceCard;
