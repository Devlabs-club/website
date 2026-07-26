import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { getReportUsage } from '@/lib/agentWrapped/usageDisplay';

const MAX_ACTIVE_HOURS_PER_DAY = 10;
const MAX_SESSION_MINUTES_FOR_DISPLAY = 6 * 60;

/**
 * Prefer active-gap telemetry when present.
 * Never invent hours when telemetry exists but is empty — show insufficient coverage.
 * Legacy reports without usage keep soft caps (no fabrications from thin air when sessions=0).
 */
export function resolveDisplayTimeInvested(report: AgentWrappedReport): {
  totalHours: number;
  last30Hours: number | null;
  longestSessionMinutes: number;
  sessionCount: number;
  estimated: boolean;
  capped: boolean;
  method: 'active_gap' | 'legacy' | 'insufficient';
  insufficient: boolean;
} {
  const usage = getReportUsage(report);
  const sessionCount =
    usage?.sessions?.allTime ||
    report.sourceCoverage?.sessionCount ||
    (report.sourceSummary.claudeSessions || 0) +
      (report.sourceSummary.codexSessions || 0) +
      (report.sourceSummary.cursorSessions || 0) +
      (report.sourceSummary.manualImports || 0) ||
    0;

  if (usage?.activeHours) {
    const totalHours = usage.activeHours.allTime > 0 ? usage.activeHours.allTime : 0;
    const last30Hours = usage.activeHours.last30 > 0 ? usage.activeHours.last30 : 0;
    const insufficient = totalHours <= 0 && last30Hours <= 0;
    const rawLongest = report.timeInvested?.longestSessionMinutes || 0;
    return {
      totalHours,
      last30Hours,
      longestSessionMinutes: Math.min(
        MAX_SESSION_MINUTES_FOR_DISPLAY,
        rawLongest > 0 ? rawLongest : Math.min(MAX_SESSION_MINUTES_FOR_DISPLAY, 60)
      ),
      sessionCount: sessionCount || 0,
      estimated: Boolean(usage.activeHours.estimated),
      capped: false,
      method: insufficient ? 'insufficient' : 'active_gap',
      insufficient,
    };
  }

  const raw = report.timeInvested || { totalHours: 0, longestSessionMinutes: 0, estimated: true };
  let totalHours = raw.totalHours > 0 ? raw.totalHours : 0;
  let capped = false;
  const daysCovered = raw.daysCovered;
  const safeSessions = Math.max(sessionCount, 1);

  if (totalHours <= 0 && sessionCount <= 0) {
    return {
      totalHours: 0,
      last30Hours: null,
      longestSessionMinutes: 0,
      sessionCount: 0,
      estimated: true,
      capped: false,
      method: 'insufficient',
      insufficient: true,
    };
  }

  if (daysCovered && totalHours > daysCovered * MAX_ACTIVE_HOURS_PER_DAY) {
    totalHours = Math.round(daysCovered * 6 * 10) / 10;
    capped = true;
  } else if (totalHours > safeSessions * 8) {
    totalHours = Math.round(safeSessions * 1.4 * 10) / 10;
    capped = true;
  }

  // Legacy soft floor only when we have session evidence but zero hours.
  if (totalHours <= 0 && sessionCount > 0) {
    totalHours = Math.max(1, Math.round(sessionCount * 1.45 * 10) / 10);
    capped = true;
  }

  const longestSessionMinutes = Math.min(
    MAX_SESSION_MINUTES_FOR_DISPLAY,
    raw.longestSessionMinutes > 0
      ? raw.longestSessionMinutes
      : Math.min(MAX_SESSION_MINUTES_FOR_DISPLAY, Math.round((totalHours * 60) / safeSessions))
  );

  return {
    totalHours,
    last30Hours: typeof raw.last30Hours === 'number' ? raw.last30Hours : null,
    longestSessionMinutes,
    sessionCount: sessionCount || safeSessions,
    estimated: capped || raw.estimated !== false,
    capped,
    method: 'legacy',
    insufficient: totalHours <= 0,
  };
}

export function formatHoursLabel(hours: number) {
  const rounded = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return rounded.toLocaleString('en-US');
}

export function hoursSupportLine(hours: number, options?: { last30?: number | null; method?: string }) {
  if (options?.method === 'insufficient') {
    return 'not enough local logs to estimate hours yet';
  }
  if (options?.last30 != null && options.last30 > 0 && hours > options.last30) {
    const last30Label = formatHoursLabel(options.last30);
    return `${last30Label} hours in the last 30 days · from local agent logs`;
  }
  if (hours >= 24 * 30) {
    const months = Math.max(1, Math.round(hours / (24 * 30)));
    return months === 1 ? "that's about a month of build time" : `that's about ${months} months of build time`;
  }
  const days = hours / 24;
  if (days < 1) return 'almost a full day of agent time';
  const rounded = Math.max(1, Math.round(days));
  if (rounded === 1) return 'almost 1 day of agent time';
  return `that's about ${rounded} days of agent time`;
}
