import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BorderBeam } from '@/components/ui/border-beam';
import { LoaderOne } from '@/components/ui/loader';
import type { FullCandidate, PipelineEntry } from './founderTypes';
import KanbanBuilderCard from './KanbanBuilderCard';
import IntroRequiredModal from './IntroRequiredModal';
import {
  KANBAN_COLUMNS,
  buildKanbanCards,
  groupKanbanCards,
  type KanbanCard,
  type KanbanColumnId,
} from '@/lib/talent/kanbanColumns';

function SortableKanbanCard({
  card,
  busy,
  hireAnimating,
  onView,
  onScheduleCall,
  onConfirmCall,
  onGenerateTrial,
  onHire,
  onViewSubmission,
}: {
  card: KanbanCard;
  busy?: boolean;
  hireAnimating?: boolean;
  onView: () => void;
  onScheduleCall: () => void;
  onConfirmCall: () => void;
  onGenerateTrial: () => void;
  onHire: () => void;
  onViewSubmission: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.builderId,
    data: { column: card.column, card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <KanbanBuilderCard
        card={card}
        busy={busy}
        hireAnimating={hireAnimating}
        onView={onView}
        onScheduleCall={onScheduleCall}
        onConfirmCall={onConfirmCall}
        onGenerateTrial={onGenerateTrial}
        onHire={onHire}
        onViewSubmission={onViewSubmission}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function KanbanColumn({
  id,
  title,
  subtitle,
  cards,
  loading,
  loadingLabel,
  children,
}: {
  id: KanbanColumnId;
  title: string;
  subtitle: string;
  cards: KanbanCard[];
  loading?: boolean;
  loadingLabel?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: loading });

  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col min-h-[520px] rounded-3xl border transition-all duration-300 ${
        loading
          ? 'border-[#fa7d22]/30 bg-[#fa7d22]/5'
          : isOver
            ? 'border-[#fa7d22]/40 bg-[#fa7d22]/5 shadow-[inset_0_0_30px_rgba(250,125,34,0.08)]'
            : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      {isOver && !loading ? (
        <BorderBeam size={100} duration={6} colorFrom="#fa7d22" colorTo="#ffb580" />
      ) : null}
      {loading ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-[#0a0b0d]/85 backdrop-blur-[2px]">
          <LoaderOne />
          <p className="text-sm font-semibold text-white/85 mt-3">{loadingLabel || 'Refreshing matches…'}</p>
          <p className="text-[11px] text-white/45 mt-1">Scanning builder profiles</p>
        </div>
      ) : null}
      <div className={`p-4 border-b border-white/5 ${loading ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-white">{title}</h3>
          <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 text-white/60">
            {loading ? '…' : cards.length}
          </Badge>
        </div>
        <p className="text-[11px] text-white/40 mt-1">{subtitle}</p>
      </div>
      <div
        className={`flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar ${
          loading ? 'opacity-40 pointer-events-none' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function FounderKanbanBoard({
  candidates,
  pipelineEntries,
  opportunityId,
  busy,
  matchesLoading,
  onViewCandidate,
  onRequestIntro,
  onScheduleCall,
  onGenerateTrial,
  onHire,
  onReviewTrial,
  onMovedToInterviewing,
}: {
  candidates: FullCandidate[];
  pipelineEntries: PipelineEntry[];
  opportunityId: string;
  busy?: boolean;
  matchesLoading?: boolean;
  onViewCandidate: (candidate: FullCandidate) => void;
  onRequestIntro: (candidate: FullCandidate) => void;
  onScheduleCall: (entry: PipelineEntry) => void;
  onGenerateTrial: (candidate: FullCandidate) => void;
  onHire: (candidate: FullCandidate) => void | Promise<void>;
  onReviewTrial: (candidate: FullCandidate) => void;
  onMovedToInterviewing?: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [introGate, setIntroGate] = useState<FullCandidate | null>(null);
  const [hireAnimatingId, setHireAnimatingId] = useState<string | null>(null);

  const cards = useMemo(
    () => buildKanbanCards(candidates, pipelineEntries),
    [candidates, pipelineEntries]
  );
  const grouped = useMemo(() => groupKanbanCards(cards), [cards]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.builderId, c])), [cards]);
  const activeCard = activeId ? cardById.get(activeId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const card = cardById.get(String(active.id));
    if (!card) return;

    const overColumn = String(over.id) as KanbanColumnId;
    if (overColumn !== 'interviewing') return;
    if (card.column === 'interviewing') return;

    if (!card.candidate.introRequested && !card.entry?.introRequestId) {
      setIntroGate(card.candidate);
      return;
    }

    onMovedToInterviewing?.();
  };

  const handleHireWithAnimation = async (candidate: FullCandidate) => {
    setHireAnimatingId(candidate.builderId);
    await onHire(candidate);
    setTimeout(() => setHireAnimatingId(null), 600);
  };

  const renderColumnCards = (columnId: KanbanColumnId) => {
    const columnCards = grouped[columnId];
    return (
      <SortableContext items={columnCards.map((c) => c.builderId)} strategy={verticalListSortingStrategy}>
        <AnimatePresence mode="popLayout">
          {columnCards.map((card) => (
            <SortableKanbanCard
              key={card.builderId}
              card={card}
              busy={busy}
              hireAnimating={hireAnimatingId === card.builderId}
              onView={() => onViewCandidate(card.candidate)}
              onScheduleCall={() => card.entry && onScheduleCall(card.entry)}
              onConfirmCall={() => card.entry && onScheduleCall(card.entry)}
              onGenerateTrial={() => onGenerateTrial(card.candidate)}
              onHire={() => handleHireWithAnimation(card.candidate)}
              onViewSubmission={() => onReviewTrial(card.candidate)}
            />
          ))}
        </AnimatePresence>
        {columnCards.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-white/35"
          >
            Drop builders here
          </motion.div>
        ) : null}
      </SortableContext>
    );
  };

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              subtitle={col.subtitle}
              cards={grouped[col.id]}
              loading={col.id === 'matches' && matchesLoading}
              loadingLabel="Refreshing matches…"
            >
              {renderColumnCards(col.id)}
            </KanbanColumn>
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <KanbanBuilderCard
              card={activeCard}
              onView={() => {}}
              onScheduleCall={() => {}}
              onConfirmCall={() => {}}
              onGenerateTrial={() => {}}
              onHire={() => {}}
              onViewSubmission={() => {}}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {introGate ? (
        <IntroRequiredModal
          candidate={introGate}
          opportunityId={opportunityId}
          onClose={() => setIntroGate(null)}
          onIntroSent={() => {
            setIntroGate(null);
            onMovedToInterviewing?.();
          }}
          onRequestIntro={onRequestIntro}
        />
      ) : null}
    </>
  );
}
