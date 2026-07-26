import React from 'react';
import { motion } from 'framer-motion';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { isUploadedAgentWrappedReport } from '@/lib/agentWrapped/types';
import {
  getPublicCardLine,
  getPublicIdentity,
  isBuildprintReport,
} from '@/lib/agentWrapped/legacyWrappedAdapter';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';

export const IdentityCard: React.FC<{
  report: AgentWrappedReport;
  index: number;
  total: number;
  onSeeHowYouBuild?: () => void;
  showAcquisitionLink?: boolean;
}> = ({ report, index, total, onSeeHowYouBuild, showAcquisitionLink }) => {
  const verified = isUploadedAgentWrappedReport(report);
  const buildprintIdentity = getPublicIdentity(report);
  const forming = report.buildprint?.forming;

  const lead = buildprintIdentity
    ? {
        name: buildprintIdentity.label,
        tagline: buildprintIdentity.proofStatement || getPublicCardLine(report),
        score: buildprintIdentity.score,
      }
    : forming
      ? {
          name: 'Still forming',
          tagline: forming.message,
          score: 0,
        }
      : report.identities?.[0]
        ? {
            name: report.identities[0].name,
            tagline: report.identities[0].tagline,
            score: report.identities[0].score,
          }
        : verified
          ? {
              name: report.archetype || 'Builder',
              tagline: report.founderRead?.summary || 'Verified agent usage uploaded.',
              score: report.score || 50,
            }
          : { name: 'Builder', tagline: 'Still writing your story.', score: 50 };

  const rest = (report.buildprint?.earnedIdentities || [])
    .filter((item) => item.id !== buildprintIdentity?.id)
    .slice(0, 2)
    .map((item) => ({ name: item.label, tagline: item.cardLine, score: item.score }));

  const leadSizeClass =
    lead.name.length > 14
      ? 'text-[2.4rem] sm:text-[2.9rem]'
      : lead.name.length > 11
        ? 'text-[3.05rem] sm:text-[3.55rem]'
        : lead.name.length > 8
          ? 'text-[3.55rem] sm:text-[4.2rem]'
          : 'text-[4.35rem] sm:text-[5.05rem]';

  const proofMetrics = (buildprintIdentity?.proofMetrics || report.buildprint?.proofStats || []).slice(0, 3);

  return (
    <StoryCardShell theme={CARD_THEMES.identity} index={index} total={total} contentClassName="">
      <div className="relative h-full">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42 }}
          className="absolute left-0 top-[10%] font-gatwick text-[0.72rem] font-black uppercase tracking-[0.48em] text-white/75"
        >
          {isBuildprintReport(report) ? 'Your AI Wrapped' : 'Final Reveal'}
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.45 }}
          className="absolute left-0 top-[18%] font-gatwick text-[1.4rem] font-black leading-none text-white"
        >
          {forming ? 'not enough evidence yet' : "you're a"}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.88, rotate: -3 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: -3 }}
          transition={{ delay: 0.22, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-[4%] top-[26%]"
        >
          <h2
            className={`font-gatwick font-black leading-[0.92] text-white drop-shadow-[7px_8px_0_rgba(226,36,16,0.82)] [overflow-wrap:anywhere] ${leadSizeClass}`}
          >
            {lead.name}
          </h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="mt-4 max-w-[21rem] font-normal text-[0.95rem] leading-snug text-white"
          >
            {lead.tagline}
          </motion.p>
        </motion.div>

        {proofMetrics.length > 0 && (
          <div className="absolute bottom-[28%] left-0 right-0 space-y-1.5">
            {proofMetrics.map((metric) => (
              <p key={metric.id} className="text-[0.72rem] font-bold text-white/80">
                {metric.label}: <span className="text-white">{metric.value}</span>
              </p>
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <div className="absolute bottom-[16%] left-0 right-[5%] grid grid-cols-2 gap-x-4 gap-y-3">
            {rest.map((identity, i) => (
              <motion.div
                key={identity.name}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.68 + i * 0.14, duration: 0.45 }}
                className="min-w-0 border border-white bg-white px-3 py-2.5 text-black shadow-[5px_5px_0_rgba(250,125,34,0.85)]"
              >
                <p className="font-gatwick text-sm font-black leading-snug [overflow-wrap:anywhere]">
                  {identity.name}
                </p>
              </motion.div>
            ))}
          </div>
        )}

        {showAcquisitionLink && onSeeHowYouBuild ? (
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeeHowYouBuild();
            }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.45 }}
            className="absolute bottom-[6%] left-0 text-sm font-black text-white underline-offset-4 hover:underline"
          >
            See how you build →
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.45 }}
            className="absolute bottom-[6%] left-0 right-[22%] border border-black/65 bg-white px-4 py-3 text-black shadow-[7px_7px_0_rgba(250,125,34,0.85)]"
          >
            <p className="text-[0.64rem] font-black uppercase leading-4 tracking-[0.18em]">
              share the proof.
            </p>
          </motion.div>
        )}
      </div>
    </StoryCardShell>
  );
};

export default IdentityCard;
