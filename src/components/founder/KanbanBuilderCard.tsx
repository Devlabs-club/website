import React from 'react';
import { motion } from 'framer-motion';
import { GripVertical, Sparkles } from 'lucide-react';
import type { KanbanCard } from '@/lib/talent/kanbanColumns';
import { canShowPostCallActions } from '@/lib/talent/kanbanColumns';
import {
  canConfirmCallTime,
  getScheduleMeetButtonState,
  isIntroPendingBuilder,
} from '@/lib/talent/founderIntroUi';

type Props = {
  card: KanbanCard;
  busy?: boolean;
  onView: () => void;
  onScheduleCall: () => void;
  onConfirmCall: () => void;
  onGenerateTrial: () => void;
  onHire: () => void;
  onViewSubmission: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  hireAnimating?: boolean;
};

export default function KanbanBuilderCard({
  card,
  busy,
  onView,
  onScheduleCall,
  onConfirmCall,
  onGenerateTrial,
  onHire,
  onViewSubmission,
  dragHandleProps,
  isDragging,
  hireAnimating,
}: Props) {
  const { candidate, entry, column } = card;
  const introPending = column === 'interviewing' && isIntroPendingBuilder(candidate, entry);
  const scheduleMeet = getScheduleMeetButtonState(candidate, entry);
  const showScheduleMeet = column === 'interviewing' && scheduleMeet.show && !scheduleMeet.disabled;
  const showScheduledMeet = column === 'interviewing' && scheduleMeet.show && scheduleMeet.disabled;
  const showConfirmTime = column === 'interviewing' && canConfirmCallTime(entry);
  const postCall = column === 'interviewing' && canShowPostCallActions(entry, candidate);
  const trialSubmitted =
    candidate.trialProject?.status === 'submitted' || entry?.trialProjectStatus === 'submitted';
  const trialActive =
    column === 'work_trial' &&
    ['sent', 'in_progress', 'rejected'].includes(candidate.trialProject?.status || entry?.trialProjectStatus || '');

  return (
    <motion.article
      layout
      layoutId={`kanban-${card.builderId}`}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={
        hireAnimating
          ? { opacity: 0, scale: 0.85, y: -20 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`group relative rounded-2xl border bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 shadow-lg transition-shadow ${
        isDragging
          ? 'border-[#fa7d22]/50 shadow-[0_0_40px_rgba(250,125,34,0.25)] z-50'
          : 'border-white/10 hover:border-[#fa7d22]/30 hover:shadow-[0_0_24px_rgba(250,125,34,0.12)]'
      }`}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#fa7d22]/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="relative flex items-start gap-2">
        <button
          type="button"
          {...dragHandleProps}
          className="mt-0.5 p-1 rounded-md text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag card"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-semibold text-white truncate">{candidate.name}</h4>
              <p className="text-xs text-[#ffb580] truncate">{candidate.headline || 'Builder'}</p>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fa7d22]/15 text-[#ffb580] border border-[#fa7d22]/25">
              {candidate.matchLabel}
            </span>
          </div>

          <p className="text-xs text-white/50 mt-2 line-clamp-2">{candidate.whyTheyMatch || candidate.bio}</p>

          <div className="flex flex-wrap gap-1 mt-3">
            {(candidate.topSkills || []).slice(0, 4).map((skill) => (
              <span key={skill} className="px-1.5 py-0.5 rounded-md text-[10px] bg-white/5 text-white/65 border border-white/5">
                {skill}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {introPending ? (
              <button
                type="button"
                disabled
                className="w-full py-2 rounded-xl border border-white/10 text-xs text-white/40 font-medium cursor-not-allowed"
              >
                Request sent · waiting for builder
              </button>
            ) : null}

            {showConfirmTime ? (
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmCall}
                className="w-full py-2 rounded-xl bg-[#fa7d22] text-black text-xs font-bold hover:bg-[#ff9b4e] disabled:opacity-50"
              >
                Confirm proposed time
              </button>
            ) : null}

            {showScheduleMeet ? (
              <button
                type="button"
                disabled={busy}
                onClick={onScheduleCall}
                className="w-full py-2 rounded-xl bg-[#fa7d22] text-black text-xs font-bold hover:bg-[#ff9b4e] disabled:opacity-50"
              >
                Schedule meet
              </button>
            ) : null}

            {showScheduledMeet ? (
              <button
                type="button"
                disabled
                className="w-full py-2 rounded-xl border border-white/10 text-xs text-white/45 font-medium cursor-not-allowed"
              >
                Scheduled meet
              </button>
            ) : null}

            {postCall ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onGenerateTrial}
                  className="w-full py-2 rounded-xl border border-[#fa7d22]/40 text-[#ffb580] text-xs font-semibold hover:bg-[#fa7d22]/10"
                >
                  Give take-home assignment
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onHire}
                  className="w-full py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400"
                >
                  Hire now
                </button>
              </div>
            ) : null}

            {column === 'work_trial' && trialActive ? (
              <p className="text-[11px] text-center text-[#ffb580]/80 py-2">
                Trial sent · awaiting builder submission
              </p>
            ) : null}

            {column === 'work_trial' && trialSubmitted ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onViewSubmission}
                  className="w-full py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 border border-white/10"
                >
                  View submission
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onHire}
                  className="w-full py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold"
                >
                  Hire now
                </button>
              </div>
            ) : null}

            {column === 'hired' ? (
              <div className="flex items-center justify-center gap-1.5 py-2 text-emerald-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                Hired
              </div>
            ) : null}

            <button
              type="button"
              onClick={onView}
              className="w-full py-1.5 text-[11px] text-white/45 hover:text-white/70 transition"
            >
              View profile
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
