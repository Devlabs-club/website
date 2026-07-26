import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { getPublicIdentity } from '@/lib/agentWrapped/legacyWrappedAdapter';
import { OWNER_CARD_ORDER, CARD_THEMES, type WrappedCardKey } from '@/components/builder/wrapped/theme';
import {
  formatHoursLabel,
  hoursSupportLine,
  resolveDisplayTimeInvested,
} from '@/lib/agentWrapped/displayTimeInvested';
import {
  formatPeakHour,
  formatTokenCount,
  formatUsd,
  getReportUsage,
  getWrappedShareHeadline,
  getWrappedShareLine,
  hasModelsFact,
  hasRhythmFact,
  hasTokensFact,
  pickStrongestFactCard,
} from '@/lib/agentWrapped/usageDisplay';

function formatMinutesLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export type WrappedOgCardPreview = {
  key: WrappedCardKey;
  label: string;
  title: string;
  peekLabel: string;
  peekValue: string;
  bgImage: string;
  wash: string;
};

export type WrappedOgFact = {
  kind: 'time' | 'tokens' | 'models' | 'rhythm';
  eyebrow: string;
  value: string;
  unit: string;
  support: string;
  footer: string;
};

export type WrappedOgData = {
  builderName: string;
  archetype: string;
  score: number;
  headline: string;
  topLanguage: string;
  topAgent: string;
  verified: boolean;
  totalHours: number;
  hoursLabel: string;
  hoursSupport: string;
  longestSessionLabel: string;
  sessionCount: number;
  defaultShareCard: WrappedCardKey;
  featuredFacts: Partial<Record<'time' | 'tokens' | 'models' | 'rhythm', WrappedOgFact>>;
  cardPreviews: WrappedOgCardPreview[];
};

const CARD_LABELS: Record<WrappedCardKey, string> = {
  cover: 'Builder Wrapped',
  time: 'Time Invested',
  tokens: 'Tokens',
  models: 'Models',
  rhythm: 'Rhythm',
  stack: 'Your Stack',
  buildSurface: 'Your Power Stack',
  agents: 'Multi-Agent',
  identity: 'AI Wrapped',
  convert: 'Get yours',
};

function peekForKey(
  key: WrappedCardKey,
  report: AgentWrappedReport,
  topLanguage: string,
  topAgent: string,
  totalHours: number,
  facts: WrappedOgData['featuredFacts'],
) {
  switch (key) {
    case 'cover':
      return { peekLabel: 'Wrapped', peekValue: '2026' };
    case 'time':
      return { peekLabel: 'Hours built', peekValue: `${Math.round(totalHours)}h` };
    case 'tokens':
      return {
        peekLabel: 'Tokens',
        peekValue: facts.tokens?.value || formatTokenCount(report.usage?.tokens?.total || 0),
      };
    case 'models':
      return {
        peekLabel: 'Top model',
        peekValue: facts.models?.value || report.usage?.models?.[0]?.id || '—',
      };
    case 'rhythm':
      return {
        peekLabel: 'Peak hour',
        peekValue: facts.rhythm?.value || formatPeakHour(report.usage?.rhythm?.peakHour || 0),
      };
    case 'stack':
      return { peekLabel: 'Top stack', peekValue: topLanguage };
    case 'buildSurface':
      return { peekLabel: 'Power stack', peekValue: topLanguage };
    case 'agents':
      return { peekLabel: 'Top agent', peekValue: topAgent };
    case 'identity':
      return { peekLabel: 'AI Wrapped', peekValue: getWrappedShareHeadline(report) };
    case 'convert':
      return { peekLabel: 'AI Wrapped', peekValue: 'Get yours' };
    default:
      return { peekLabel: 'AI Wrapped', peekValue: getWrappedShareHeadline(report) };
  }
}

function cardTitleForKey(
  key: WrappedCardKey,
  report: AgentWrappedReport,
  topLanguage: string,
  topAgent: string,
  totalHours: number,
  facts: WrappedOgData['featuredFacts'],
) {
  switch (key) {
    case 'cover':
      return '2026 wrapped';
    case 'time':
      return `${Math.round(totalHours)}h built`;
    case 'tokens':
      return facts.tokens ? `${facts.tokens.value} tokens` : 'Tokens burned';
    case 'models':
      return facts.models ? `${facts.models.value} · ${facts.models.unit}` : 'Top model';
    case 'rhythm':
      return facts.rhythm ? `Peak ${facts.rhythm.value}` : 'Coding rhythm';
    case 'stack':
      return topLanguage;
    case 'buildSurface':
      return report.languages?.[0]?.name || report.agentSplit?.[0]?.agent || 'Power stack';
    case 'agents':
      return topAgent;
    case 'identity':
      return getWrappedShareHeadline(report);
    case 'convert':
      return 'Get your AI Wrapped';
    default:
      return 'AI Wrapped';
  }
}

function buildFeaturedFacts(report: AgentWrappedReport, displayTime: ReturnType<typeof resolveDisplayTimeInvested>) {
  const usage = getReportUsage(report);
  const facts: WrappedOgData['featuredFacts'] = {};

  const hours =
    displayTime.method === 'active_gap' && displayTime.last30Hours && displayTime.last30Hours > 0
      ? displayTime.last30Hours
      : displayTime.totalHours;
  if (!displayTime.insufficient && hours > 0) {
    facts.time = {
      kind: 'time',
      eyebrow: 'you built for',
      value: formatHoursLabel(hours),
      unit: 'hours with agents',
      support: hoursSupportLine(displayTime.totalHours, {
        last30: displayTime.last30Hours,
        method: displayTime.method,
      }),
      footer: `longest session: ${formatMinutesLabel(displayTime.longestSessionMinutes)}`,
    };
  }

  if (hasTokensFact(usage) && usage) {
    const cost = formatUsd(usage.tokens.retailCostUsd);
    facts.tokens = {
      kind: 'tokens',
      eyebrow: 'you burned',
      value: formatTokenCount(usage.tokens.total),
      unit: 'tokens with agents',
      support: cost
        ? `~${cost} retail · ${Math.round((usage.tokens.cache / Math.max(usage.tokens.total, 1)) * 100)}% cache`
        : `${Math.round((usage.tokens.work / Math.max(usage.tokens.total, 1)) * 100)}% fresh · ${Math.round((usage.tokens.cache / Math.max(usage.tokens.total, 1)) * 100)}% cache`,
      footer: usage.tokens.cursorEstimated
        ? 'includes Cursor tokens estimated from active time'
        : `${usage.tokens.byAgent?.[0]?.agent || 'agents'} led the burn`,
    };
  }

  if (hasModelsFact(usage) && usage?.models?.[0]) {
    const top = usage.models[0];
    facts.models = {
      kind: 'models',
      eyebrow: 'your top model was',
      value: top.id,
      unit: `${top.percent}% of sessions`,
      support: usage.models
        .slice(1, 3)
        .map((m) => `${m.id} ${m.percent}%`)
        .join(' · ') || 'from local agent logs',
      footer: `${top.sessions.toLocaleString('en-US')} sessions on ${top.id}`,
    };
  }

  if (hasRhythmFact(usage) && usage?.rhythm) {
    const peak = formatPeakHour(usage.rhythm.peakHour).replace(':00 ', '');
    facts.rhythm = {
      kind: 'rhythm',
      eyebrow: 'you code hardest at',
      value: peak,
      unit: 'peak local hour',
      support: `${usage.rhythm.weekdayPct}% weekday · ${usage.rhythm.weekendPct}% weekend`,
      footer: 'from local agent timestamps',
    };
  }

  return facts;
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
  const usage = getReportUsage(report);
  const builderName =
    (profile.name && !profile.name.includes('@') ? profile.name : null) ||
    report.builderName ||
    profile.name ||
    'DevLabs Builder';
  const topLanguage = report.languages?.[0]?.name || 'TypeScript';
  const topAgent = report.agentSplit?.[0]?.agent || report.sourceCoverage?.agents?.[0] || 'Codex';
  const displayTime = resolveDisplayTimeInvested(report);
  const totalHours = displayTime.totalHours;
  const hoursLabel = formatHoursLabel(totalHours);
  const hoursSupport = hoursSupportLine(totalHours, {
    last30: displayTime.last30Hours,
    method: displayTime.method,
  });
  const longestSessionLabel = formatMinutesLabel(displayTime.longestSessionMinutes);
  const sessionCount = displayTime.sessionCount;
  const identity = getPublicIdentity(report);
  const headline =
    getWrappedShareLine(report).slice(0, 120) ||
    getWrappedShareHeadline(report).slice(0, 120) ||
    profile.headline ||
    'Building habits backed by proof on DevLabs';

  const featuredFacts = buildFeaturedFacts(report, displayTime);
  const defaultShareCard = pickStrongestFactCard(usage);
  const score = Math.round(report.score || 0);

  const ogOrder = OWNER_CARD_ORDER.filter((key) => {
    if (key === 'tokens') return hasTokensFact(usage);
    if (key === 'models') return hasModelsFact(usage);
    if (key === 'rhythm') return hasRhythmFact(usage);
    return true;
  });

  const cardPreviews: WrappedOgCardPreview[] = ogOrder.map((key) => {
    const peek = peekForKey(key, report, topLanguage, topAgent, totalHours, featuredFacts);
    return {
      key,
      label: CARD_LABELS[key],
      title: cardTitleForKey(key, report, topLanguage, topAgent, totalHours, featuredFacts),
      peekLabel: peek.peekLabel,
      peekValue: peek.peekValue,
      bgImage: CARD_THEMES[key].bgImage,
      wash: CARD_THEMES[key].wash,
    };
  });

  return {
    builderName,
    archetype: hasTokensFact(usage)
      ? `${formatTokenCount(usage!.tokens.total)} tokens`
      : identity?.label || report.archetype || 'Builder',
    score,
    headline,
    topLanguage,
    topAgent,
    verified: true,
    totalHours,
    hoursLabel,
    hoursSupport,
    longestSessionLabel,
    sessionCount,
    defaultShareCard,
    featuredFacts,
    cardPreviews,
  };
}
