import React from 'react';
import { Plus, Trash2, Briefcase, Loader2 } from 'lucide-react';
import type { ScoutSearchSummary } from './adminScoutUtils';
import { formatScoutSearchDate } from './adminScoutUtils';

function statusLabel(status: string): string {
  if (status === 'shortlisted') return 'Results ready';
  if (status === 'draft') return 'Draft';
  return status.replace(/_/g, ' ');
}

function statusColor(status: string): string {
  if (status === 'shortlisted') return 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10';
  if (status === 'draft') return 'text-white/50 border-white/10 bg-white/5';
  return 'text-[#fa7d22] border-[#fa7d22]/25 bg-[#fa7d22]/10';
}

export default function AdminScoutSearchPicker({
  searches,
  loading,
  deletingId,
  onOpen,
  onCreate,
  onDelete,
}: {
  searches: ScoutSearchSummary[];
  loading?: boolean;
  deletingId?: string | null;
  onOpen: (search: ScoutSearchSummary) => void;
  onCreate: () => void;
  onDelete: (search: ScoutSearchSummary) => void;
}) {
  return (
    <div className="max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white">Founder agent test chats</h2>
        <p className="text-sm text-white/45 mt-1">
          Open an existing role or start a new founder-agent chat. Chats are saved for this browser session.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-white/40 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading searches…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={onCreate}
            className="group min-h-[168px] rounded-2xl border border-dashed border-white/20 bg-white/[0.02] hover:border-[#fa7d22]/50 hover:bg-[#fa7d22]/5 transition-all p-5 flex flex-col items-center justify-center gap-3 text-center"
          >
            <div className="w-11 h-11 rounded-xl bg-[#fa7d22]/15 border border-[#fa7d22]/30 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5 text-[#fa7d22]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">New hire</p>
              <p className="text-xs text-white/40 mt-1">Start a fresh founder-agent chat</p>
            </div>
          </button>

          {searches.map((search) => {
            const isDeleting = deletingId === search.id;
            return (
              <div
                key={search.id}
                className="relative min-h-[168px] rounded-2xl border border-white/10 bg-black/30 hover:border-white/20 transition-all overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => onOpen(search)}
                  disabled={isDeleting}
                  className="w-full h-full text-left p-5 pr-12 disabled:opacity-50"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <Briefcase className="w-4 h-4 text-white/50" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{search.roleTitle}</p>
                      <p className="text-xs text-white/40 truncate mt-0.5">{search.company}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${statusColor(search.status)}`}
                  >
                    {statusLabel(search.status)}
                  </span>

                  {search.skillsNeeded.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {search.skillsNeeded.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/45"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : search.builderWillDo ? (
                    <p className="text-xs text-white/40 mt-3 line-clamp-2">{search.builderWillDo}</p>
                  ) : (
                    <p className="text-xs text-white/30 mt-3 italic">No brief details yet</p>
                  )}

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-white/35">
                    <span>Updated {formatScoutSearchDate(search.updatedAt)}</span>
                    {search.hasShortlist ? (
                      <span className="text-[#fa7d22]/80">
                        {search.totalMatches} candidate{search.totalMatches === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span>No search yet</span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(search);
                  }}
                  disabled={isDeleting}
                  title="Delete search"
                  className="absolute top-3 right-3 w-8 h-8 rounded-lg border border-white/10 bg-black/40 text-white/35 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && searches.length === 0 ? (
        <p className="text-center text-sm text-white/35 mt-6">
          No saved chats yet. Start a new hire above.
        </p>
      ) : null}
    </div>
  );
}
