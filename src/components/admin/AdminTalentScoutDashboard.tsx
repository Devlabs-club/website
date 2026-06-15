import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background';
import AdminScoutChat, { getOrCreateScoutSessionId } from './AdminScoutChat';
import AdminScoutResults, { type ScoutSearchStatus } from './AdminScoutResults';
import AdminScoutCandidateDrawer from './AdminScoutCandidateDrawer';
import AdminScoutSearchPicker from './AdminScoutSearchPicker';
import {
  deleteScoutSearch,
  fetchScoutSearches,
  loadScoutShortlist,
  type AdminCandidate,
  type ScoutSearchSummary,
} from './adminScoutUtils';

type DashboardView = 'picker' | 'workspace';

export default function AdminTalentScoutDashboard() {
  const [scoutSessionId, setScoutSessionId] = useState('');
  const [view, setView] = useState<DashboardView>('picker');
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [startFresh, setStartFresh] = useState(true);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [currentBrief, setCurrentBrief] = useState<Record<string, unknown> | null>(null);
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [searchStatus, setSearchStatus] = useState<ScoutSearchStatus>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminCandidate | null>(null);

  const [searches, setSearches] = useState<ScoutSearchSummary[]>([]);
  const [searchesLoading, setSearchesLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setScoutSessionId(getOrCreateScoutSessionId());
  }, []);

  const refreshSearches = useCallback(async () => {
    if (!scoutSessionId) return;
    setSearchesLoading(true);
    try {
      const list = await fetchScoutSearches(scoutSessionId);
      setSearches(list);
    } catch {
      setSearches([]);
    } finally {
      setSearchesLoading(false);
    }
  }, [scoutSessionId]);

  useEffect(() => {
    if (scoutSessionId && view === 'picker') {
      void refreshSearches();
    }
  }, [scoutSessionId, view, refreshSearches]);

  const roleLabel = useMemo(() => {
    if (!currentBrief?.roleTitle) return null;
    const title = String(currentBrief.roleTitle);
    if (title === 'New role') return null;
    return title;
  }, [currentBrief]);

  const resetWorkspaceState = () => {
    setOpportunityId(null);
    setCurrentBrief(null);
    setCandidates([]);
    setSearchStatus('idle');
    setSearchError(null);
    setSelected(null);
  };

  const enterWorkspace = async (opts: { id: string | null; fresh: boolean; brief?: Record<string, unknown> | null }) => {
    resetWorkspaceState();
    setStartFresh(opts.fresh);
    setOpportunityId(opts.id);
    if (opts.brief) setCurrentBrief(opts.brief);
    setView('workspace');
    setWorkspaceKey((k) => k + 1);

    if (opts.id && !opts.fresh) {
      try {
        const data = await loadScoutShortlist(scoutSessionId, opts.id);
        if (data.opportunity) setCurrentBrief(data.opportunity);
        const loaded = data.shortlist?.candidates || [];
        setCandidates(loaded);
        setSearchStatus(loaded.length > 0 ? 'finished' : 'idle');
      } catch {
        // workspace still opens; user can run search from chat
      }
    }
  };

  const handleOpenSearch = (search: ScoutSearchSummary) => {
    void enterWorkspace({ id: search.id, fresh: false });
  };

  const handleCreateSearch = () => {
    void enterWorkspace({ id: null, fresh: true });
  };

  const handleDeleteSearch = async (search: ScoutSearchSummary) => {
    const label = search.roleTitle || 'this search';
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setDeletingId(search.id);
    try {
      await deleteScoutSearch(scoutSessionId, search.id);
      setSearches((prev) => prev.filter((s) => s.id !== search.id));
      if (opportunityId === search.id && view === 'workspace') {
        setView('picker');
        resetWorkspaceState();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not delete search';
      window.alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBackToPicker = () => {
    setView('picker');
    resetWorkspaceState();
    void refreshSearches();
  };

  if (!scoutSessionId) {
    return (
      <div className="min-h-screen bg-[#0c0c0e] flex items-center justify-center text-white/50 text-sm">
        Loading scout session…
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0c0c0e] text-white overflow-hidden">
      <DottedGlowBackground className="opacity-40" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {view === 'workspace' ? (
              <button
                type="button"
                onClick={handleBackToPicker}
                className="flex items-center gap-1.5 text-xs text-white/45 hover:text-white shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                All searches
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="text-[#fa7d22] uppercase tracking-[0.2em] text-[10px] font-semibold">
                Internal · No auth
              </p>
              <h1 className="text-xl font-semibold text-white mt-1 truncate">Talent Scout Console</h1>
              <p className="text-xs text-white/40 mt-1 truncate">
                {view === 'picker'
                  ? 'Pick a search or create a new one'
                  : `Same Founder OS agent & discovery pipeline${roleLabel ? ` · ${roleLabel}` : ''}`}
              </p>
            </div>
          </div>
          {view === 'workspace' ? (
            <button
              type="button"
              onClick={handleCreateSearch}
              className="text-xs px-4 py-2 rounded-xl border border-white/15 text-white/70 hover:text-white hover:border-white/30 shrink-0"
            >
              New search
            </button>
          ) : null}
        </header>

        <main className="flex-1 p-4 md:p-6 min-h-0 overflow-y-auto">
          {view === 'picker' ? (
            <AdminScoutSearchPicker
              searches={searches}
              loading={searchesLoading}
              deletingId={deletingId}
              onOpen={handleOpenSearch}
              onCreate={handleCreateSearch}
              onDelete={(search) => void handleDeleteSearch(search)}
            />
          ) : (
            <div className="max-w-[1400px] mx-auto h-[calc(100vh-120px)] grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 md:gap-6">
              <section className="min-h-[420px] lg:min-h-0 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm p-4 flex flex-col">
                <AdminScoutChat
                  scoutSessionId={scoutSessionId}
                  opportunityId={opportunityId}
                  startFresh={startFresh}
                  resetKey={workspaceKey}
                  onOpportunityChange={(id, brief) => {
                    setOpportunityId(id);
                    setCurrentBrief(brief);
                  }}
                  onSearchStart={() => {
                    setSearchStatus('loading');
                    setSearchError(null);
                  }}
                  onSearchResults={(next, brief) => {
                    setCandidates(next);
                    setSearchStatus('finished');
                    if (brief) setCurrentBrief(brief);
                  }}
                  onSearchError={(message) => {
                    setSearchStatus('error');
                    setSearchError(message);
                  }}
                />
              </section>

              <section className="min-h-[420px] lg:min-h-0 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm p-4 flex flex-col">
                <AdminScoutResults
                  candidates={candidates}
                  searchStatus={searchStatus}
                  searchError={searchError}
                  onSelect={setSelected}
                />
              </section>
            </div>
          )}
        </main>
      </div>

      <AdminScoutCandidateDrawer candidate={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
