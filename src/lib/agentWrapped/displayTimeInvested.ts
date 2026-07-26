import type { AgentWrappedReport } from '@/lib/agentWrapped/types';

const MAX_ACTIVE_HOURS_PER_DAY = 10;
const MAX_SESSION_MINUTES_FOR_DISPLAY = 6 * 60;

/**
 * Wall-clock session spans (Cursor files open for days) inflate totals.
 * Prefer a realistic active-build estimate for UI + share captions.
 */
export function resolveDisplayTimeInvested(report: AgentWrappedReport): {
  totalHours: number;
  longestSessionMinutes: number;
  estimated: boolean;
  capped: boolean;
} {
  const raw = report.timeInvested || { totalHours: 0, longestSessionMinutes: 0, estimated: true };
  const sessionCount =
    report.sourceCoverage?.sessionCount ||
    (report.sourceSummary.claudeSessions || 0) +
      (report.sourceSummary.codexSessions || 0) +
      (report.sourceSummary.cursorSessions || 0) +
      (report.sourceSummary.manualImports || 0) ||
    1;

  let totalHours = raw.totalHours > 0 ? raw.totalHours : 0;
  let capped = false;
  const daysCovered = raw.daysCovered;

  if (daysCovered && totalHours > daysCovered * MAX_ACTIVE_HOURS_PER_DAY) {
    totalHours = Math.round(daysCovered * 6 * 10) / 10;
    capped = true;
  } else if (totalHours > sessionCount * 8) {
    // Average session longer than 8h implies overlapping/wall-clock inflation.
    totalHours = Math.round(sessionCount * 1.4 * 10) / 10;
    capped = true;
  }

  if (totalHours <= 0) {
    totalHours = Math.max(24, Math.round(sessionCount * 1.45));
    capped = true;
  }

  const longestSessionMinutes = Math.min(
    MAX_SESSION_MINUTES_FOR_DISPLAY,
    raw.longestSessionMinutes > 0
      ? raw.longestSessionMinutes
      : Math.min(MAX_SESSION_MINUTES_FOR_DISPLAY, Math.round((totalHours * 60) / Math.max(sessionCount, 1)))
  );

  return {
    totalHours,
    longestSessionMinutes,
    estimated: capped || raw.estimated !== false,
    capped,
  };
}

export function formatHoursLabel(hours: number) {
  const rounded = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return rounded.toLocaleString('en-US');
}

export function hoursSupportLine(hours: number) {
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
