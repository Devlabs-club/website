import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { CARD_ORDER, CARD_THEMES, type WrappedCardKey } from '@/components/builder/wrapped/theme';

export type WrappedOgCardPreview = {
  key: WrappedCardKey;
  label: string;
  title: string;
  peekLabel: string;
  peekValue: string;
  bgImage: string;
  wash: string;
};

function peekForKey(
  key: WrappedCardKey,
  report: AgentWrappedReport,
  topLanguage: string,
  topAgent: string,
  totalHours: number,
  score: number,
) {
  switch (key) {
    case 'cover':
      return { peekLabel: 'Wrapped', peekValue: '2026' };
    case 'time':
      return { peekLabel: 'Hours built', peekValue: `${Math.round(totalHours)}h` };
    case 'stack':
      return { peekLabel: 'Top stack', peekValue: topLanguage };
    case 'buildSurface':
      return {
        peekLabel: 'Power stack',
        peekValue: topLanguage,
      };
    case 'agents':
      return { peekLabel: 'Top agent', peekValue: topAgent };
    case 'identity':
      return { peekLabel: 'Archetype', peekValue: report.archetype || 'Builder' };
    default:
      return { peekLabel: 'Wrapped', peekValue: `Score ${score}` };
  }
}

export type WrappedOgData = {
  builderName: string;
  archetype: string;
  score: number;
  headline: string;
  topLanguage: string;
  topAgent: string;
  verified: boolean;
  totalHours: number;
  cardPreviews: WrappedOgCardPreview[];
};

const CARD_LABELS: Record<WrappedCardKey, string> = {
  cover: 'Builder Wrapped',
  time: 'Time Invested',
  stack: 'Your Stack',
  buildSurface: 'Your Power Stack',
  agents: 'Multi-Agent',
  identity: 'Final Reveal',
};

function cardTitleForKey(key: WrappedCardKey, report: AgentWrappedReport, topLanguage: string, topAgent: string, totalHours: number) {
  switch (key) {
    case 'cover':
      return '2026 wrapped';
    case 'time':
      return `${Math.round(totalHours)}h built`;
    case 'stack':
      return topLanguage;
    case 'buildSurface':
      return report.languages?.[0]?.name || report.agentSplit?.[0]?.agent || 'Power stack';
    case 'agents':
      return topAgent;
    case 'identity':
      return report.archetype || 'Builder';
    default:
      return 'Wrapped';
  }
}

/** OG card data only when a real local agent upload exists — never profile fallback. */
export async function loadWrappedOgData(builderId: string, _origin: string): Promise<WrappedOgData | null> {
  if (!mongoose.Types.ObjectId.isValid(builderId)) return null;

  await connectAdminDB();
  const profile = (await BuilderProfile.findById(builderId).lean()) as {
    name?: string;
    headline?: string | null;
  } | null;
  if (!profile) return null;

  const uploaded = (await AgentWrappedReportModel.findOne({
    builderId,
    source: 'uploaded_agent_usage',
  })
    .sort({ createdAt: -1 })
    .lean()) as { report?: AgentWrappedReport } | null;

  if (!uploaded?.report) return null;

  const report = uploaded.report;
  const builderName =
    (profile.name && !profile.name.includes('@') ? profile.name : null) ||
    report.builderName ||
    profile.name ||
    'DevLabs Builder';
  const topLanguage = report.languages?.[0]?.name || 'TypeScript';
  const topAgent = report.agentSplit?.[0]?.agent || report.sourceCoverage?.agents?.[0] || 'Codex';
  const sessionCount =
    report.sourceCoverage?.sessionCount ||
    (report.sourceSummary.claudeSessions || 0) +
      (report.sourceSummary.codexSessions || 0) +
      (report.sourceSummary.cursorSessions || 0) +
      (report.sourceSummary.manualImports || 0);
  const totalHours =
    report.timeInvested?.totalHours && report.timeInvested.totalHours > 0
      ? report.timeInvested.totalHours
      : Math.max(24, Math.round(sessionCount * 1.45));
  const headline =
    report.founderRead?.summary?.slice(0, 120) ||
    profile.headline ||
    'Proof-of-work builder on DevLabs';

  const score = Math.round(report.score || 0);
  const cardPreviews: WrappedOgCardPreview[] = CARD_ORDER.map((key) => {
    const peek = peekForKey(key, report, topLanguage, topAgent, totalHours, score);
    return {
      key,
      label: CARD_LABELS[key],
      title: cardTitleForKey(key, report, topLanguage, topAgent, totalHours),
      peekLabel: peek.peekLabel,
      peekValue: peek.peekValue,
      bgImage: CARD_THEMES[key].bgImage,
      wash: CARD_THEMES[key].wash,
    };
  });

  return {
    builderName,
    archetype: report.archetype || 'Builder',
    score,
    headline,
    topLanguage,
    topAgent,
    verified: true,
    totalHours,
    cardPreviews,
  };
}
