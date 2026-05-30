import type { FullCandidate, PipelineEntry } from '@/components/founder/founderTypes';

export type KanbanColumnId = 'matches' | 'interviewing' | 'work_trial' | 'hired';

export const KANBAN_COLUMNS: Array<{ id: KanbanColumnId; title: string; subtitle: string }> = [
  { id: 'matches', title: 'Matches', subtitle: 'Drag to Interviewing when ready' },
  { id: 'interviewing', title: 'Interviewing', subtitle: 'Intro → call → decision' },
  { id: 'work_trial', title: 'Work trial', subtitle: 'Take-home in progress' },
  { id: 'hired', title: 'Hired', subtitle: 'Welcome aboard' },
];

export type KanbanCard = {
  builderId: string;
  candidate: FullCandidate;
  entry: PipelineEntry | null;
  column: KanbanColumnId;
};

export function resolveKanbanColumn(
  candidate: FullCandidate,
  entry: PipelineEntry | null
): KanbanColumnId {
  const matchStatus = candidate.matchStatus || entry?.matchStatus || 'generated';
  const trialStatus = candidate.trialProject?.status || entry?.trialProjectStatus;

  if (matchStatus === 'hired' || entry?.status === 'hired') return 'hired';

  if (
    matchStatus === 'trial' ||
    matchStatus === 'offer' ||
    entry?.status === 'trial' ||
    entry?.status === 'offer' ||
    (trialStatus && !['draft', null, undefined].includes(trialStatus))
  ) {
    return 'work_trial';
  }

  if (
    candidate.introRequested ||
    entry?.introRequestId ||
    ['intro_requested', 'builder_interested', 'interviewing'].includes(entry?.status || '') ||
    ['intro_requested', 'builder_interested', 'interviewing'].includes(matchStatus)
  ) {
    return 'interviewing';
  }

  return 'matches';
}

export function isCallPast(entry: PipelineEntry | null): boolean {
  if (!entry?.confirmedCallEndAt) return Boolean(entry?.callCompletedAt);
  return new Date(entry.confirmedCallEndAt).getTime() <= Date.now();
}

export function canShowPostCallActions(entry: PipelineEntry | null, candidate: FullCandidate): boolean {
  if (entry?.callCompletedAt || candidate.callCompletedAt) return true;
  if (entry?.callScheduleStatus !== 'confirmed' && !entry?.confirmedCallEndAt) return false;
  return isCallPast(entry);
}

export function buildKanbanCards(
  candidates: FullCandidate[],
  entries: PipelineEntry[]
): KanbanCard[] {
  const entryByBuilder = new Map(entries.map((e) => [e.builderId, e]));
  return candidates.map((candidate) => {
    const entry = entryByBuilder.get(candidate.builderId) || null;
    return {
      builderId: candidate.builderId,
      candidate,
      entry,
      column: resolveKanbanColumn(candidate, entry),
    };
  });
}

export function groupKanbanCards(cards: KanbanCard[]): Record<KanbanColumnId, KanbanCard[]> {
  const groups: Record<KanbanColumnId, KanbanCard[]> = {
    matches: [],
    interviewing: [],
    work_trial: [],
    hired: [],
  };
  for (const card of cards) {
    groups[card.column].push(card);
  }
  return groups;
}
