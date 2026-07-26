import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { getEvidenceStrength, isBuildprintReport } from '@/lib/agentWrapped/legacyWrappedAdapter';
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
  const evidence = getEvidenceStrength(report);
  const sessions =
    report.buildprint?.proofStats?.find((item) => item.id === 'substantial_sessions')?.value ??
    report.sourceCoverage?.sessionCount ??
    0;

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
      key: 'evidence',
      label: 'Evidence',
      value: evidence
        ? evidence.charAt(0).toUpperCase() + evidence.slice(1)
        : isBuildprintReport(report)
          ? 'Emerging'
          : 'Legacy',
      isText: true,
    },
    {
      key: 'sessions',
      label: 'Sessions',
      value: Number(sessions) || 0,
      suffix: ' analyzed',
      isText: false,
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
          transition={{ duration: 0.4 }}
          className="absolute left-0 top-[12%] font-gatwick text-[0.72rem] font-black uppercase tracking-[0.42em] text-white/70"
        >
          Your Power Stack
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="absolute left-0 right-[8%] top-[22%] font-gatwick text-[2.6rem] font-black leading-[0.92] tracking-[-0.06em] text-white sm:text-[3.1rem]"
        >
          <span className="block">{headline.line1}</span>
          <span className="block text-white/90">{headline.line2}</span>
        </motion.h2>

        <div className="absolute bottom-[14%] left-0 right-0 grid grid-cols-2 gap-3">
          {flexStats.map((stat, i) => (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.06, duration: 0.35 }}
              className="rounded-xl border border-white/15 bg-black/25 px-3 py-3 backdrop-blur-sm"
            >
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white/55">{stat.label}</p>
              <p className="mt-1 font-gatwick text-lg font-black text-white">
                {stat.isText ? (
                  stat.value
                ) : (
                  <>
                    <CountUp value={Number(stat.value) || 0} />
                    {stat.suffix}
                  </>
                )}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="absolute bottom-[5%] left-0 text-xs font-bold text-white/55"
        >
          {topLanguage} · {topAgent}
        </motion.p>
      </div>
    </StoryCardShell>
  );
};

export default BuildSurfaceCard;
