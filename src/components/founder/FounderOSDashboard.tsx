import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth_manager';
import FounderCandidateDrawer from './FounderCandidateDrawer';
import FounderIntroModal from './FounderIntroModal';
import { ErrorBanner, LoadingBlock } from './founderUi';
import type {
  FullCandidate,
  PublicShortlist,
  FounderPipeline,
} from './founderTypes';
import FounderOnboardingChat from './FounderOnboardingChat';
import FounderRoleIntakeChat from './FounderRoleIntakeChat';
import FounderUnifiedWorkspace from './FounderUnifiedWorkspace';
import CallScheduleModal from './CallScheduleModal';
import TrialReviewPanel from './TrialReviewPanel';
import HireConfirmModal from './HireConfirmModal';
import NotificationCenter from '../talent/NotificationCenter';
import { DottedGlowBackground } from '../ui/dotted-glow-background';
import { AmbientBackground } from '../ui/AmbientBackground';
import { Bot, Plus } from 'lucide-react';
import type { NotificationItem, PipelineEntry } from './founderTypes';

export type Opportunity = {
  _id: string;
  company?: string;
  startupSummary?: string;
  industry?: string;
  builderWillDo?: string;
  roleTitle?: string;
  roleType?: string[];
  skillsNeeded?: string[];
  workType?: string;
  timeline?: string;
  budget?: string;
  locationPreference?: string;
  availabilityNeeded?: string;
  successIn30Days?: string;
  niceToHaveSkills?: string[];
  seniority?: string;
  hoursPerWeek?: string;
  deliverables?: string[];
  fundingStage?: string;
  skippedFields?: string[];
  status?: string;
  updatedAt?: string;
};

export default function FounderOSDashboard() {
  const { user, logout } = useAuth();
  
  // App States
  const [searches, setSearches] = useState<Opportunity[]>([]);
  const [shortlists, setShortlists] = useState<PublicShortlist[]>([]);
  const [pipeline, setPipeline] = useState<FounderPipeline | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  
  const [callModal, setCallModal] = useState<{
    opportunityId: string;
    builderId: string;
    builderName: string;
    callScheduleId?: string | null;
    pendingFounderConfirm?: boolean;
  } | null>(null);
  const [hireModal, setHireModal] = useState<{
    opportunityId: string;
    builderId: string;
    builderName: string;
    skipTrial?: boolean;
  } | null>(null);
  const [trialReviewModal, setTrialReviewModal] = useState<{
    opportunityId: string;
    builderId: string;
    builderName: string;
    trialProject: FullCandidate['trialProject'];
  } | null>(null);
  const [activeOpportunityId, setActiveOpportunityId] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      return localStorage.getItem(`devlabs_founder_onboarded_${user.id}`) === 'true';
    }
    return false;
  });
  const [showIntakeChat, setShowIntakeChat] = useState(false);
  const [showBilling, setShowBilling] = useState(false);

  // Busy/Loading States
  const [searchesLoading, setSearchesLoading] = useState(true);
  const [unlockBusy, setUnlockBusy] = useState<string | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [candidateActionBusy, setCandidateActionBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal/Drawer States
  const [drawerCandidate, setDrawerCandidate] = useState<FullCandidate | null>(null);
  const [drawerOpportunityId, setDrawerOpportunityId] = useState<string | null>(null);
  const [introModal, setIntroModal] = useState<{
    candidate: FullCandidate;
    opportunityId: string;
  } | null>(null);

  // Load dashboard search data from API
  const loadSearches = useCallback(async () => {
    setSearchesLoading(true);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'get_founder_dashboard', payload: {} }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load dashboard data');
      
      const loadedSearches = Array.isArray(data.opportunities) ? data.opportunities : [];
      setSearches(loadedSearches);
      setShortlists(Array.isArray(data.shortlists) ? data.shortlists : []);
      setPipeline(data.pipeline || null);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadNotificationCount(
        typeof data.unreadNotificationCount === 'number' ? data.unreadNotificationCount : 0
      );
      setLoadError(null);

      // If onboarding is completed and there are searches, set the active search
      if (loadedSearches.length > 0 && !activeOpportunityId) {
        const active = loadedSearches.find((s) => s.status !== 'closed');
        if (active) {
          setActiveOpportunityId(active._id);
        } else {
          setActiveOpportunityId(loadedSearches[0]._id);
        }
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load founder data');
    } finally {
      setSearchesLoading(false);
    }
  }, [activeOpportunityId]);

  useEffect(() => {
    loadSearches();
  }, [loadSearches]);

  // Keep shortlists and drawer candidate in sync
  useEffect(() => {
    if (!drawerCandidate) return;
    const sl = shortlists.find((s) =>
      s.fullCandidates?.some((c) => c.builderId === drawerCandidate.builderId)
    );
    const updated = sl?.fullCandidates?.find((c) => c.builderId === drawerCandidate.builderId);
    if (updated) setDrawerCandidate(updated);
    else setDrawerCandidate(null);
  }, [shortlists, drawerCandidate?.builderId]);

  // Unlock Shortlist API call
  const unlockShortlist = async (opportunityId: string) => {
    if (unlockBusy) return;
    setUnlockBusy(opportunityId);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'unlock_shortlist', payload: { opportunityId } }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unlock failed');
      await loadSearches();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unlock failed');
    } finally {
      setUnlockBusy(null);
    }
  };

  // Pipeline Status Update API call
  const updatePipelineStatus = async (
    opportunityId: string,
    builderId: string,
    status: string
  ) => {
    setPipelineBusy(true);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_candidate_status',
          payload: { opportunityId, builderId, status },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Update status failed');
      await loadSearches();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setPipelineBusy(false);
    }
  };

  // Candidate Actions (Save / Hide) API call
  const runCandidateAction = async (
    opportunityId: string,
    builderId: string,
    candidateAction: 'save' | 'hide'
  ) => {
    setCandidateActionBusy(true);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'founder_candidate_action',
          payload: { opportunityId, builderId, candidateAction },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Action failed');
      await loadSearches();
      if (drawerCandidate?.builderId === builderId && candidateAction === 'hide') {
        setDrawerCandidate(null);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setCandidateActionBusy(false);
    }
  };

  const openDrawer = (candidate: FullCandidate, opportunityId: string) => {
    setDrawerOpportunityId(opportunityId);
    setDrawerCandidate(candidate);
  };

  const openIntroModal = (candidate: FullCandidate, opportunityId: string) => {
    if (candidate.introRequested) return;
    setIntroModal({ candidate, opportunityId });
  };

  const getPipelineEntry = (opportunityId: string, builderId: string): PipelineEntry | null => {
    return pipeline?.entries?.find(
      (e) => e.opportunityId === opportunityId && e.builderId === builderId
    ) || null;
  };

  const completeCall = async (opportunityId: string, builderId: string) => {
    setPipelineBusy(true);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'complete_call',
          payload: { opportunityId, builderId },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed');
      await loadSearches();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed');
    } finally {
      setPipelineBusy(false);
    }
  };

  const openScheduleCall = (entry: PipelineEntry | { opportunityId: string; builderId: string; candidateName?: string }, pendingConfirm?: boolean) => {
    setCallModal({
      opportunityId: entry.opportunityId,
      builderId: entry.builderId,
      builderName: 'candidateName' in entry && entry.candidateName ? entry.candidateName : drawerCandidate?.name || 'Builder',
      callScheduleId: 'callScheduleId' in entry ? entry.callScheduleId : getPipelineEntry(entry.opportunityId, entry.builderId)?.callScheduleId,
      pendingFounderConfirm: pendingConfirm,
    });
  };

  const handleOnboardingCompleted = (startupData: { company: string; startupSummary: string; logoUrl?: string }) => {
    if (user?.id) {
      localStorage.setItem(`devlabs_founder_onboarded_${user.id}`, 'true');
    }
    setOnboardingCompleted(true);
    loadSearches();
  };

  // 1. Onboarding Screen
  if (!onboardingCompleted && !searchesLoading && searches.length === 0) {
    return <FounderOnboardingChat onCompleted={handleOnboardingCompleted} />;
  }

  // Loading Screen
  if (searchesLoading && searches.length === 0) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center flex-col gap-4 relative">
        <AmbientBackground overlayOpacity={0.72} />
        <DottedGlowBackground className="fixed inset-0 z-0 w-full h-full" color="rgba(255,255,255,0.05)" glowColor="rgba(250, 125, 34, 0.25)" />
        <LoadingBlock label="Loading Founder Workspace…" />
      </div>
    );
  }

  // Filter out closed searches for active workspace
  const activeSearches = searches.filter((s) => s.status !== 'closed');

  return (
    <div className="relative min-h-screen w-full text-white font-manrope flex flex-col overflow-x-hidden">
      <AmbientBackground overlayOpacity={0.65} />

      {/* Subtle dotted shimmer on top of ambient glows */}
      <DottedGlowBackground
        className="fixed inset-0 z-0 w-full h-full pointer-events-none"
        color="rgba(255,255,255,0.05)"
        glowColor="rgba(250, 125, 34, 0.28)"
        gap={14}
        radius={2}
        opacity={0.45}
        speedMin={0.3}
        speedMax={1}
        speedScale={0.8}
      />
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(8_8%_3.5%/0.65)_100%)]" />

      {/* Main dashboard content container */}
      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10 flex-1 flex flex-col">
        
        {loadError && (
          <div className="mb-6">
            <ErrorBanner message={loadError} onRetry={loadSearches} />
          </div>
        )}

        {/* 2. Zero-state Home Screen */}
        {activeSearches.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto text-center py-20 animate-fade-in">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#fa7d22]/20 to-[#fa7d22]/5 border border-[#fa7d22]/30 flex items-center justify-center text-[#ffb580] shadow-lg shadow-[#fa7d22]/5 mb-6">
              <Bot className="w-8 h-8" />
            </div>
            
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent leading-tight">
              Find builders who can actually ship.
            </h1>
            <p className="text-white/50 text-sm mt-4 leading-relaxed">
              Describe the developer role you need. The DevLabs agent analyzes your brief, matches candidates from our student ecosystem based on real proof, and runs introductions.
            </p>

            <button
              onClick={() => setShowIntakeChat(true)}
              className="mt-8 px-6 py-3 rounded-full bg-gradient-to-r from-[#fa7d22] to-[#ff9b4e] text-black font-bold hover:opacity-95 shadow-lg shadow-[#fa7d22]/20 transition flex items-center gap-2"
            >
              <Plus className="w-5 h-5 stroke-[2.5px]" />
              Search for builder
            </button>

            <button
              onClick={logout}
              className="mt-6 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Sign out of account
            </button>
          </div>
        ) : (
          /* 3. Unified Workspace Dashboard Cockpit */
          <FounderUnifiedWorkspace
            opportunities={searches}
            shortlists={shortlists}
            activeOpportunityId={activeOpportunityId}
            setActiveOpportunityId={setActiveOpportunityId}
            pipeline={pipeline}
            pipelineBusy={pipelineBusy}
            updatePipelineStatus={updatePipelineStatus}
            runCandidateAction={runCandidateAction}
            unlockShortlist={unlockShortlist}
            unlockBusy={unlockBusy}
            candidateActionBusy={candidateActionBusy}
            onNewSearchClick={() => setShowIntakeChat(true)}
            onExploreCandidate={(cand, oppId) => openDrawer(cand, oppId)}
            onRequestIntro={(cand, oppId) => openIntroModal(cand, oppId)}
            onBillingClick={() => setShowBilling(!showBilling)}
            showBilling={showBilling}
            setShowBilling={setShowBilling}
            logout={logout}
            notifications={notifications}
            unreadNotificationCount={unreadNotificationCount}
            onPipelineScheduleCall={(entry) => openScheduleCall(entry, entry.callScheduleStatus === 'pending_founder')}
            onPipelineCompleteCall={completeCall}
            onPipelineHire={(entry, skipTrial) =>
              setHireModal({
                opportunityId: entry.opportunityId,
                builderId: entry.builderId,
                builderName: entry.candidateName,
                skipTrial,
              })
            }
            onPipelineReviewTrial={(entry, candidate) =>
              setTrialReviewModal({
                opportunityId: entry.opportunityId,
                builderId: entry.builderId,
                builderName: entry.candidateName,
                trialProject: candidate?.trialProject || null,
              })
            }
            onExplorePipelineEntry={(entry) => {
              const cand = shortlists
                .flatMap((s) => s.fullCandidates || [])
                .find((c) => c.builderId === entry.builderId);
              if (cand) openDrawer(cand, entry.opportunityId);
            }}
          />
        )}
      </div>

      {/* Full-Screen Intake Chat Overlay */}
      {showIntakeChat && (
        <FounderRoleIntakeChat
          opportunityId={activeOpportunityId}
          onClose={() => setShowIntakeChat(false)}
          onSearchCompleted={(oppId) => {
            setShowIntakeChat(false);
            setActiveOpportunityId(oppId);
            loadSearches();
          }}
        />
      )}

      {/* Intro Request Modal Popup */}
      {introModal && (
        <FounderIntroModal
          candidate={introModal.candidate}
          opportunityId={introModal.opportunityId}
          onClose={() => setIntroModal(null)}
          onSent={() => {
            setDrawerCandidate(null);
            loadSearches();
          }}
        />
      )}

      {/* Candidate Profile Details Drawer */}
      {drawerCandidate && drawerOpportunityId && (
        <FounderCandidateDrawer
          candidate={drawerCandidate}
          opportunityId={drawerOpportunityId}
          pipelineEntry={getPipelineEntry(drawerOpportunityId, drawerCandidate.builderId)}
          onClose={() => {
            setDrawerCandidate(null);
            setDrawerOpportunityId(null);
          }}
          onTrialSaved={loadSearches}
          actionBusy={candidateActionBusy || pipelineBusy}
          onRequestIntro={() => {
            const sl = shortlists.find((s) =>
              s.fullCandidates?.some((c) => c.builderId === drawerCandidate.builderId)
            );
            if (sl) openIntroModal(drawerCandidate, sl.opportunityId);
          }}
          onSave={() => {
            const sl = shortlists.find((s) =>
              s.fullCandidates?.some((c) => c.builderId === drawerCandidate.builderId)
            );
            if (sl) runCandidateAction(sl.opportunityId, drawerCandidate.builderId, 'save');
          }}
          onHide={() => {
            const sl = shortlists.find((s) =>
              s.fullCandidates?.some((c) => c.builderId === drawerCandidate.builderId)
            );
            if (sl) {
              runCandidateAction(sl.opportunityId, drawerCandidate.builderId, 'hide');
              setDrawerCandidate(null);
            }
          }}
          onAskAgent={() => setDrawerCandidate(null)}
          onScheduleCall={(pendingConfirm) =>
            openScheduleCall(
              {
                opportunityId: drawerOpportunityId,
                builderId: drawerCandidate.builderId,
                candidateName: drawerCandidate.name,
                ...getPipelineEntry(drawerOpportunityId, drawerCandidate.builderId),
              } as PipelineEntry,
              pendingConfirm
            )
          }
          onConfirmCall={() =>
            openScheduleCall(
              getPipelineEntry(drawerOpportunityId, drawerCandidate.builderId) || {
                opportunityId: drawerOpportunityId,
                builderId: drawerCandidate.builderId,
                candidateName: drawerCandidate.name,
              } as PipelineEntry,
              true
            )
          }
          onCompleteCall={() => completeCall(drawerOpportunityId, drawerCandidate.builderId)}
          onHire={(skipTrial) =>
            setHireModal({
              opportunityId: drawerOpportunityId,
              builderId: drawerCandidate.builderId,
              builderName: drawerCandidate.name,
              skipTrial,
            })
          }
          onReviewTrial={() =>
            setTrialReviewModal({
              opportunityId: drawerOpportunityId,
              builderId: drawerCandidate.builderId,
              builderName: drawerCandidate.name,
              trialProject: drawerCandidate.trialProject,
            })
          }
        />
      )}

      {callModal ? (
        <CallScheduleModal
          opportunityId={callModal.opportunityId}
          builderId={callModal.builderId}
          builderName={callModal.builderName}
          callScheduleId={callModal.callScheduleId}
          pendingFounderConfirm={callModal.pendingFounderConfirm}
          onClose={() => setCallModal(null)}
          onScheduled={loadSearches}
        />
      ) : null}

      {hireModal ? (
        <HireConfirmModal
          opportunityId={hireModal.opportunityId}
          builderId={hireModal.builderId}
          builderName={hireModal.builderName}
          skipTrial={hireModal.skipTrial}
          onClose={() => setHireModal(null)}
          onHired={() => {
            setDrawerCandidate(null);
            loadSearches();
          }}
        />
      ) : null}

      {trialReviewModal?.trialProject ? (
        <TrialReviewPanel
          opportunityId={trialReviewModal.opportunityId}
          builderId={trialReviewModal.builderId}
          builderName={trialReviewModal.builderName}
          trialProject={trialReviewModal.trialProject}
          onClose={() => setTrialReviewModal(null)}
          onReviewed={loadSearches}
        />
      ) : null}
    </div>
  );
}
