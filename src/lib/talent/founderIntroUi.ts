import type { FullCandidate, PipelineEntry } from '@/components/founder/founderTypes';
import { isCallPast } from '@/lib/talent/kanbanColumns';

export function isIntroAcceptedByBuilder(
  candidate: FullCandidate,
  entry?: PipelineEntry | null
): boolean {
  const status = entry?.introRequestStatus || candidate.introRequestStatus;
  return (
    status === 'builder_accepted' ||
    status === 'interested' ||
    candidate.matchStatus === 'builder_interested' ||
    entry?.status === 'builder_interested'
  );
}

export function isIntroSent(candidate: FullCandidate, entry?: PipelineEntry | null): boolean {
  return (
    candidate.introRequested ||
    Boolean(entry?.introRequestId) ||
    ['requested', 'builder_accepted', 'builder_declined', 'interested'].includes(
      entry?.introRequestStatus || candidate.introRequestStatus || ''
    )
  );
}

export function isIntroPendingBuilder(
  candidate: FullCandidate,
  entry?: PipelineEntry | null
): boolean {
  const status = entry?.introRequestStatus || candidate.introRequestStatus;
  return (
    status === 'requested' ||
    (candidate.introRequested &&
      status !== 'builder_accepted' &&
      status !== 'interested' &&
      candidate.matchStatus !== 'builder_interested')
  );
}

export function getIntroButtonLabel(
  candidate: FullCandidate,
  entry?: PipelineEntry | null
): { label: string; disabled: boolean; show: boolean } {
  if (isIntroAcceptedByBuilder(candidate, entry)) {
    return { label: '', disabled: true, show: false };
  }
  if (isIntroSent(candidate, entry)) {
    return { label: 'Request sent', disabled: true, show: true };
  }
  return { label: 'Request intro', disabled: false, show: true };
}

export function canScheduleMeet(
  candidate: FullCandidate,
  entry?: PipelineEntry | null
): boolean {
  if (!isIntroAcceptedByBuilder(candidate, entry)) return false;
  if (entry?.callScheduleStatus === 'pending_founder') return false;
  if (isCallPast(entry) || entry?.callCompletedAt || candidate.callCompletedAt) return false;
  return !isMeetScheduled(entry);
}

export function isMeetScheduled(entry?: PipelineEntry | null): boolean {
  const status = entry?.callScheduleStatus;
  if (!status || status === 'cancelled' || status === 'completed') return false;
  if (isCallPast(entry) || entry?.callCompletedAt) return false;
  return ['confirmed', 'pending_builder', 'proposed'].includes(status);
}

export function getScheduleMeetButtonState(
  candidate: FullCandidate,
  entry?: PipelineEntry | null
): { label: string; disabled: boolean; show: boolean } {
  if (canConfirmCallTime(entry)) {
    return { label: '', disabled: true, show: false };
  }
  if (canScheduleMeet(candidate, entry)) {
    return { label: 'Schedule meet', disabled: false, show: true };
  }
  if (isMeetScheduled(entry) && isIntroAcceptedByBuilder(candidate, entry)) {
    return { label: 'Scheduled meet', disabled: true, show: true };
  }
  return { label: '', disabled: true, show: false };
}

export function canConfirmCallTime(entry?: PipelineEntry | null): boolean {
  return entry?.callScheduleStatus === 'pending_founder';
}

export function canShowPostMeetingActions(
  entry: PipelineEntry | null,
  candidate: FullCandidate
): boolean {
  return isCallPast(entry) || Boolean(entry?.callCompletedAt || candidate.callCompletedAt);
}
