import type { FullCandidate, PipelineEntry } from '@/components/founder/founderTypes';

type CallTimingEntry = Pick<
  PipelineEntry,
  'callCompletedAt' | 'confirmedCallStartAt' | 'confirmedCallEndAt' | 'callScheduleStatus'
> | null;

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Intro call slot has started (or was marked complete). */
export function hasCallSlotStarted(entry: CallTimingEntry): boolean {
  if (entry?.callCompletedAt) return true;
  if (entry?.callScheduleStatus === 'completed') return true;

  const start = parseTime(entry?.confirmedCallStartAt);
  if (start !== null && start <= Date.now()) return true;

  // Legacy: only end stored — treat as started once the window has ended
  const end = parseTime(entry?.confirmedCallEndAt);
  if (end !== null && !entry?.confirmedCallStartAt && end <= Date.now()) return true;

  return false;
}

/** Intro call slot has fully ended. */
export function hasCallSlotEnded(entry: CallTimingEntry): boolean {
  if (entry?.callCompletedAt) return true;
  if (entry?.callScheduleStatus === 'completed') return true;

  const end = parseTime(entry?.confirmedCallEndAt);
  return end !== null && end <= Date.now();
}

/** @deprecated Prefer hasCallSlotEnded — kept for schedule-meet gating */
export function isCallPast(entry: CallTimingEntry): boolean {
  return hasCallSlotEnded(entry);
}

export function canShowPostCallActions(
  entry: CallTimingEntry,
  candidate: Pick<FullCandidate, 'callCompletedAt'>
): boolean {
  if (entry?.callCompletedAt || candidate.callCompletedAt) return true;
  if (entry?.callScheduleStatus === 'completed') return true;
  // After start time, founder can hire or assign a work trial (no need to wait for slot end)
  return hasCallSlotStarted(entry);
}

export function pipelineNeedsCallClockTick(
  entries: Array<Pick<PipelineEntry, 'confirmedCallStartAt' | 'confirmedCallEndAt' | 'callCompletedAt' | 'callScheduleStatus'>>
): boolean {
  const now = Date.now();
  const horizon = now + 2 * 60 * 60 * 1000;
  return entries.some((e) => {
    if (e.callCompletedAt || e.callScheduleStatus === 'completed') return false;
    const start = parseTime(e.confirmedCallStartAt);
    const end = parseTime(e.confirmedCallEndAt);
    if (start !== null && start > now && start <= horizon) return true;
    if (end !== null && end > now && end <= horizon) return true;
    if (start !== null && start <= now && end !== null && end > now) return true;
    return false;
  });
}
