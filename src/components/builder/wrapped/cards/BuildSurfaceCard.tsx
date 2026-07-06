import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { StoryCardShell } from '../StoryCardShell';
import { CountUp } from '../CountUp';
import { CARD_THEMES } from '../theme';

const LABELS: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  infra: 'Infra',
  tests: 'Tests',
  docs: 'Docs',
  agents: 'Agents',
  designSystems: 'Design systems',
  apis: 'APIs',
};

const COLORS = ['#fff', '#ffdd24', '#ff6b1a', '#168df7', '#ff2d18', '#50dc96'];

export const BuildSurfaceCard: React.FC<{ report: AgentWrappedReport; index: number; total: number }> = ({
  report,
  index,
  total,
}) => {
  const surfaces = [
    ['frontend', report.buildSurface.frontend],
    ['backend', report.buildSurface.backend],
    ['agents', Math.round((report.agentMaturity.contextScore + report.agentMaturity.iterationScore) / 2)],
    ['infra', report.buildSurface.infra],
    ['apis', Math.round(report.buildSurface.backend * 0.72 + report.buildSurface.tests * 0.18)],
    ['designSystems', Math.round(report.buildSurface.frontend * 0.62 + (report.buildSurface.docs || 0) * 0.25)],
  ] as [string, number][];
  const top = [...surfaces].sort((a, b) => b[1] - a[1])[0];
  const maxValue = Math.max(...surfaces.map(([, value]) => value), 1);
  const ranked = [...surfaces].sort((a, b) => b[1] - a[1]);

  return (
    <StoryCardShell theme={CARD_THEMES.buildSurface} index={index} total={total} contentClassName="">
      <div className="relative h-full">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42 }}
          className="absolute left-0 top-[13%] font-gatwick text-[0.72rem] font-black uppercase tracking-[0.48em] text-white/75"
        >
          Build Surface
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-0 top-[20%] font-gatwick text-[3.1rem] font-black leading-[0.95] text-white drop-shadow-[6px_6px_0_rgba(226,38,16,0.72)] sm:text-[3.65rem]"
        >
          {top ? LABELS[top[0]] : 'Full-stack'}
          <br />
          energy.
        </motion.h2>

        <div className="absolute left-0 right-[6%] top-[40%] bottom-[10%] flex flex-col">
          <div className="flex h-[7.75rem] min-h-0 items-end justify-between gap-[0.6cqw] sm:h-[8.75rem]">
            {ranked.map(([key, value], i) => {
              const barHeight = 2.1 + (value / maxValue) * 4.8;
              const isTop = i === 0;
              const color = COLORS[surfaces.findIndex(([k]) => k === key) % COLORS.length];
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 + i * 0.07, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  className="flex min-w-0 flex-1 flex-col items-center justify-end"
                >
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.55 + i * 0.07 }}
                    className={`mb-1 font-gatwick text-[0.9rem] font-black leading-none sm:text-[1rem] ${
                      isTop ? 'text-white' : 'text-white/80'
                    }`}
                  >
                    <CountUp value={value} durationMs={700} />
                  </motion.span>
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.32 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      height: `${barHeight}rem`,
                      originY: 1,
                      background: `linear-gradient(180deg, ${color} 0%, ${color}88 100%)`,
                      transform: `skewY(${i % 2 ? -3 : 3}deg)`,
                    }}
                    className={`relative w-full border-2 border-white ${
                      isTop
                        ? 'shadow-[7px_7px_0_rgba(227,39,15,0.9)]'
                        : 'shadow-[4px_4px_0_rgba(0,0,0,0.5)]'
                    }`}
                  >
                    <div className="absolute inset-0 opacity-30 mix-blend-overlay [background-image:linear-gradient(0deg,rgba(0,0,0,.35)_0_1px,transparent_1px)] [background-size:100%_6px]" />
                  </motion.div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-[4.5cqw] grid grid-cols-2 gap-x-[2.2cqw] gap-y-[2.4cqw] sm:grid-cols-3">
            {surfaces.slice(0, 6).map(([key, value], i) => (
              <motion.div
                key={`stat-${key}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62 + i * 0.05, duration: 0.36 }}
                className="min-w-0 border border-white bg-white px-[1.8cqw] py-[1.6cqw] text-black shadow-[5px_5px_0_rgba(227,39,15,0.85)]"
              >
                <p className="truncate text-[0.5rem] font-black uppercase tracking-[0.06em]">{LABELS[key] || key}</p>
                <p className="mt-[0.4cqw] font-gatwick text-[1.35rem] font-black leading-none">
                  <CountUp value={value} durationMs={700} />
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </StoryCardShell>
  );
};

export default BuildSurfaceCard;
