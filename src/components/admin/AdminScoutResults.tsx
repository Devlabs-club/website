import React, { useMemo, useState } from 'react';
import { Search, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import type { AdminCandidate } from './adminScoutUtils';

export type ScoutSearchStatus = 'idle' | 'loading' | 'finished' | 'error';

export default function AdminScoutResults({
  candidates,
  searchStatus = 'idle',
  searchError,
  onSelect,
}: {
  candidates: AdminCandidate[];
  searchStatus?: ScoutSearchStatus;
  searchError?: string | null;
  onSelect: (candidate: AdminCandidate) => void;
}) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...candidates].sort((a, b) => b.matchScore - a.matchScore);
    if (!q) return sorted;
    return sorted.filter((c) => {
      const haystack = [
        c.name,
        c.email,
        c.headline,
        c.universityOrCompany,
        ...(c.topSkills || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [candidates, filter]);

  const statusLine = useMemo(() => {
    if (searchStatus === 'loading') return 'Searching talent graph…';
    if (searchStatus === 'error') return searchError || 'Search failed';
    if (searchStatus === 'finished') {
      if (candidates.length === 0) return 'Search finished · no matches';
      return `Search finished · ${filtered.length} builder${filtered.length === 1 ? '' : 's'}`;
    }
    return 'Run a search to see matches';
  }, [searchStatus, searchError, candidates.length, filtered.length]);

  const loading = searchStatus === 'loading';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Results</h2>
          <p
            className={`text-xs mt-0.5 flex items-center gap-1.5 ${
              searchStatus === 'finished'
                ? 'text-emerald-400/85'
                : searchStatus === 'error'
                  ? 'text-red-400/85'
                  : 'text-white/40'
            }`}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            ) : searchStatus === 'finished' ? (
              <CheckCircle2 className="w-3 h-3 shrink-0" />
            ) : null}
            {statusLine}
          </p>
        </div>
      </div>

      {candidates.length > 0 ? (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, skill, email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
        {loading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-2 text-sm text-white/40">
            <Loader2 className="w-5 h-5 animate-spin text-[#fa7d22]" />
            <span>Scanning proof-of-work graph…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">
            {searchStatus === 'finished'
              ? 'Search finished with no matching builders.'
              : candidates.length
                ? 'No matches for that filter.'
                : 'Candidates appear here after search.'}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filtered.map((candidate) => (
              <button
                key={candidate.builderId}
                type="button"
                onClick={() => onSelect(candidate)}
                className="w-full text-left px-4 py-3.5 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{candidate.name}</p>
                    {candidate.email ? (
                      <p className="text-xs text-white/40 truncate mt-0.5">{candidate.email}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {candidate.topSkills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[#fa7d22]">{candidate.matchScore}</p>
                      <p className="text-[10px] text-white/35">{candidate.matchLabel}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
