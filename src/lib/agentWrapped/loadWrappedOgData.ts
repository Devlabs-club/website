import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import {
  getPublicCardLine,
  getPublicHeadline,
  getPublicIdentity,
} from '@/lib/agentWrapped/legacyWrappedAdapter';
import { OWNER_CARD_ORDER, CARD_THEMES, type WrappedCardKey } from '@/components/builder/wrapped/theme';
import { resolveDisplayTimeInvested } from '@/lib/agentWrapped/displayTimeInvested';

const OG_CARD_ORDER: WrappedCardKey[] = OWNER_CARD_ORDER;

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
      return { peekLabel: 'AI Wrapped', peekValue: getPublicHeadline(report) };
    case 'convert':
      return { peekLabel: 'AI Wrapped', peekValue: 'Get yours' };
    default:
      return { peekLabel: 'AI Wrapped', peekValue: getPublicHeadline(report) };
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
  identity: 'AI Wrapped',
  convert: 'Get yours',
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
      return getPublicHeadline(report);
    case 'convert':
      return 'Get your AI Wrapped';
    default:
      return 'AI Wrapped';
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
  const displayTime = resolveDisplayTimeInvested(report);
  const totalHours = displayTime.totalHours;
  const identity = getPublicIdentity(report);
  const headline =
    getPublicCardLine(report).slice(0, 120) ||
    report.founderRead?.summary?.slice(0, 120) ||
    profile.headline ||
    'Building habits backed by proof on DevLabs';

  const score = Math.round(report.score || 0);
  const cardPreviews: WrappedOgCardPreview[] = OG_CARD_ORDER.map((key) => {
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
    archetype: identity?.label || report.archetype || 'Builder',
    score,
    headline,
    topLanguage,
    topAgent,
    verified: true,
    totalHours,
    cardPreviews,
  };
}
