import type { AgentWrappedReport, AgentWrappedUsage } from '@/lib/agentWrapped/types';
import { formatHoursLabel, resolveDisplayTimeInvested } from '@/lib/agentWrapped/displayTimeInvested';

export function getReportUsage(report: AgentWrappedReport | null | undefined): AgentWrappedUsage | null {
  return report?.usage?.schemaVersion ? report.usage : null;
}

export function formatTokenCount(n: number) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(v));
}

export function formatPeakHour(hour: number) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  const suffix = h >= 12 ? 'pm' : 'am';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

export function formatUsd(n: number | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(0)}`;
}

/** Prefer tokens surprise, else active hours — for default OG / share. */
export function pickStrongestFactCard(usage: AgentWrappedUsage | null | undefined): 'tokens' | 'time' {
  if (usage?.tokens?.total && usage.tokens.total > 0) return 'tokens';
  return 'time';
}

export function hasTokensFact(usage: AgentWrappedUsage | null | undefined) {
  return Boolean(usage?.tokens?.total && usage.tokens.total > 0);
}

export function hasModelsFact(usage: AgentWrappedUsage | null | undefined) {
  return Boolean(usage?.models?.length);
}

export function hasRhythmFact(usage: AgentWrappedUsage | null | undefined) {
  const buckets = usage?.rhythm?.hourBuckets;
  if (!buckets?.length) return false;
  return buckets.some((n) => n > 0);
}

export function hasUsageFacts(report: AgentWrappedReport | null | undefined) {
  const usage = getReportUsage(report);
  return hasTokensFact(usage) || hasModelsFact(usage) || hasRhythmFact(usage) || Boolean(usage?.activeHours);
}

/** Public share headline — telemetry facts, never Buildprint identity labels. */
export function getWrappedShareHeadline(report: AgentWrappedReport): string {
  const usage = getReportUsage(report);
  if (hasTokensFact(usage) && usage) {
    return `I burned ${formatTokenCount(usage.tokens.total)} tokens with agents`;
  }
  const time = resolveDisplayTimeInvested(report);
  const hours =
    time.method === 'active_gap' && time.last30Hours && time.last30Hours > 0
      ? time.last30Hours
      : time.totalHours;
  if (!time.insufficient && hours > 0) {
    return `I built for ${formatHoursLabel(hours)} hours with agents`;
  }
  if (hasModelsFact(usage) && usage?.models?.[0]) {
    return `My top model was ${usage.models[0].id} (${usage.models[0].percent}%)`;
  }
  if (hasRhythmFact(usage) && usage?.rhythm) {
    return `I code hardest at ${formatPeakHour(usage.rhythm.peakHour).replace(':00 ', '')}`;
  }
  return 'My DevLabs AI Wrapped';
}

/** Supporting fact line for captions / OG. */
export function getWrappedShareLine(report: AgentWrappedReport): string {
  const usage = getReportUsage(report);
  const parts: string[] = [];
  const time = resolveDisplayTimeInvested(report);

  if (hasTokensFact(usage) && usage) {
    if (!time.insufficient && time.totalHours > 0) {
      parts.push(`${formatHoursLabel(time.totalHours)} active hours`);
    }
  } else if (!time.insufficient && time.totalHours > 0) {
    // headline already has hours; skip
  }

  if (hasModelsFact(usage) && usage?.models?.[0]) {
    parts.push(`${usage.models[0].id} ${usage.models[0].percent}%`);
  }
  if (hasRhythmFact(usage) && usage?.rhythm) {
    parts.push(`peak ${formatPeakHour(usage.rhythm.peakHour).replace(':00 ', '')}`);
  }
  if (parts.length) return parts.slice(0, 3).join(' · ');
  return 'hours, tokens, and models from local agent logs';
}
