import React, { useState, useMemo } from 'react';
import type { Opportunity, PublicShortlist, FullCandidate, AnonymousCandidate, FounderPipeline, PipelineEntry, NotificationItem } from './founderTypes';
import BuilderSnapshotCard from './BuilderSnapshotCard';
import NotificationCenter from '../talent/NotificationCenter';
import { Bot, Plus, ChevronDown, Activity, Award, Briefcase, DollarSign, Calendar, MapPin, User, LogOut, Check, CreditCard } from 'lucide-react';
import { useAuth } from '../auth_manager';

interface FounderUnifiedWorkspaceProps {
  opportunities: Opportunity[];
  shortlists: PublicShortlist[];
  activeOpportunityId: string | null;
  setActiveOpportunityId: (id: string | null) => void;
  pipeline: FounderPipeline | null;
  pipelineBusy: boolean;
  updatePipelineStatus: (opportunityId: string, builderId: string, status: string) => void;
  runCandidateAction: (opportunityId: string, builderId: string, action: 'save' | 'hide') => void;
  unlockShortlist: (opportunityId: string) => void;
  unlockBusy: string | null;
  candidateActionBusy: boolean;
  onNewSearchClick: () => void;
  onExploreCandidate: (candidate: any, opportunityId: string) => void;
  onRequestIntro: (candidate: any, opportunityId: string) => void;
  onBillingClick: () => void;
  showBilling: boolean;
  setShowBilling: (show: boolean) => void;
  logout: () => void;
  notifications?: NotificationItem[];
  unreadNotificationCount?: number;
  onPipelineScheduleCall: (entry: PipelineEntry) => void;
  onPipelineCompleteCall: (opportunityId: string, builderId: string) => void;
  onPipelineHire: (entry: PipelineEntry, skipTrial?: boolean) => void;
  onPipelineReviewTrial: (entry: PipelineEntry, candidate: FullCandidate | undefined) => void;
  onExplorePipelineEntry: (entry: PipelineEntry) => void;
}

const PIPELINE_STATUS_OPTIONS = [
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'intro_requested', label: 'Intro Requested' },
  { value: 'builder_interested', label: 'Builder Interested' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'trial', label: 'Trial' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'closed', label: 'Closed' },
] as const;

export default function FounderUnifiedWorkspace({
  opportunities,
  shortlists,
  activeOpportunityId,
  setActiveOpportunityId,
  pipeline,
  pipelineBusy,
  updatePipelineStatus,
  runCandidateAction,
  unlockShortlist,
  unlockBusy,
  candidateActionBusy,
  onNewSearchClick,
  onExploreCandidate,
  onRequestIntro,
  onBillingClick,
  showBilling,
  setShowBilling,
  logout,
  notifications = [],
  unreadNotificationCount = 0,
  onPipelineScheduleCall,
  onPipelineCompleteCall,
  onPipelineHire,
  onPipelineReviewTrial,
  onExplorePipelineEntry,
}: FounderUnifiedWorkspaceProps) {
  const { user } = useAuth();
  const [filterTab, setFilterTab] = useState<'all' | 'saved'>('all');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  // Retrieve logo from local storage
  const logoData = useMemo(() => {
    if (typeof window !== 'undefined' && user?.id) {
      return localStorage.getItem(`devlabs_founder_logo_${user.id}`) || null;
    }
    return null;
  }, [user]);

  // Find active opportunity details
  const activeOpp = useMemo(() => {
    if (!activeOpportunityId && opportunities.length > 0) {
      return opportunities[0];
    }
    return opportunities.find((o) => o._id === activeOpportunityId) || null;
  }, [opportunities, activeOpportunityId]);

  // Handle active opportunity fallback
  const currentOppId = activeOpp?._id || null;

  // Active Shortlist matches
  const activeShortlist = useMemo(() => {
    if (!currentOppId) return null;
    return shortlists.find((s) => s.opportunityId === currentOppId) || null;
  }, [shortlists, currentOppId]);

  // Filter candidates list (Saved vs All)
  const candidateFeed = useMemo(() => {
    if (!activeShortlist) return [];
    
    if (activeShortlist.unlocked && activeShortlist.fullCandidates) {
      const candidates = activeShortlist.fullCandidates as FullCandidate[];
      // Filter out hidden ones
      const visible = candidates.filter((c) => !c.hidden);
      if (filterTab === 'saved') {
        return visible.filter((c) => c.saved);
      }
      return visible;
    } else {
      // Locked preview (anonymous candidates)
      return activeShortlist.candidates || [];
    }
  }, [activeShortlist, filterTab]);

  // Filter pipeline entries specifically for this active role
  const rolePipelineEntries = useMemo(() => {
    if (!pipeline?.entries || !currentOppId) return [];
    return pipeline.entries.filter((entry) => entry.opportunityId === currentOppId);
  }, [pipeline, currentOppId]);

  // Group role pipeline entries by status
  const groupedRolePipeline = useMemo(() => {
    const groups: Record<string, PipelineEntry[]> = {};
    PIPELINE_STATUS_OPTIONS.forEach((opt) => {
      groups[opt.value] = [];
    });
    
    rolePipelineEntries.forEach((entry) => {
      if (groups[entry.status]) {
        groups[entry.status].push(entry);
      } else {
        groups[entry.status] = [entry];
      }
    });
    return groups;
  }, [rolePipelineEntries]);

  // Status mapping colors
  const statusColors: Record<string, string> = {
    shortlisted: 'border-white/10 bg-white/5 text-white/70',
    intro_requested: 'border-[#fa7d22]/30 bg-[#fa7d22]/10 text-[#ffb580]',
    builder_interested: 'border-blue-500/20 bg-blue-500/5 text-blue-300',
    interviewing: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-300',
    trial: 'border-pink-500/20 bg-pink-500/5 text-pink-300',
    offer: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    hired: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
    closed: 'border-white/5 bg-white/[0.02] text-white/40',
  };

  return (
    <div className="flex-1 flex flex-col gap-6">
      
      {/* Header bar */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        
        {/* Startup Brand Info */}
        <div className="flex items-center gap-3">
          {logoData ? (
            <img
              src={logoData}
              alt={activeOpp?.company || 'Startup Logo'}
              className="w-10 h-10 rounded-xl object-cover bg-white/10 border border-white/15"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#fa7d22]/20 to-[#fa7d22]/5 border border-[#fa7d22]/30 flex items-center justify-center font-bold text-sm text-[#ffb580]">
              {(activeOpp?.company || user?.name || 'S').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="font-semibold text-lg leading-tight text-white">
              {activeOpp?.company || 'Your Startup'}
            </h1>
            <p className="text-xs text-white/40 font-medium">Founder Cockpit</p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-3">
          
          {/* Active Role Selector Dropdown */}
          {opportunities.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white/90 text-sm font-semibold flex items-center gap-2.5 transition"
              >
                <Briefcase className="w-4 h-4 text-[#fa7d22]" />
                {activeOpp?.roleTitle || 'Select Role'}
                <ChevronDown className="w-4 h-4 text-white/50" />
              </button>
              
              {showRoleDropdown && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-[#0e1012] p-2 shadow-2xl z-20">
                  <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold px-3 py-2">Switch Active Search</p>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {opportunities.map((opp) => (
                      <button
                        key={opp._id}
                        onClick={() => {
                          setActiveOpportunityId(opp._id);
                          setShowRoleDropdown(false);
                          setShowBilling(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex flex-col gap-0.5 hover:bg-white/5 transition ${
                          opp._id === currentOppId ? 'bg-[#fa7d22]/15 text-[#ffb580]' : 'text-white/70'
                        }`}
                      >
                        <span>{opp.roleTitle}</span>
                        <span className="text-[10px] text-white/40 font-medium">{opp.company}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* New Search CTA */}
          <button
            onClick={onNewSearchClick}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#fa7d22] to-[#ff9b4e] text-black text-sm font-bold hover:opacity-95 shadow-md shadow-[#fa7d22]/10 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 stroke-[3px]" />
            New Search
          </button>

          {/* Billing button */}
          <NotificationCenter
            initialNotifications={notifications}
            initialUnreadCount={unreadNotificationCount}
          />

          <button
            onClick={onBillingClick}
            className={`p-2.5 rounded-xl border transition ${
              showBilling
                ? 'border-[#fa7d22]/40 bg-[#fa7d22]/10 text-[#ffb580]'
                : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white'
            }`}
            title="Billing & Pricing"
          >
            <CreditCard className="w-4 h-4" />
          </button>

          {/* Sign out */}
          <button
            onClick={logout}
            className="p-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-white/40 hover:text-white/60 hover:border-white/20 transition"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main content cockpit view */}
      {showBilling ? (
        <div className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-2xl font-bold">Billing</h2>
            <p className="text-white/60 text-sm mt-1">Simple transparent pricing for hiring tech talent.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Free Preview', price: '$0', detail: 'Anonymous matches, candidate statistics.' },
              {
                name: 'Shortlist Unlock',
                price: '$499 / role',
                detail: 'Reveal names, Github proof links, and initiate intros.',
                highlight: true,
              },
              { name: 'Hiring Sprint', price: '$2,000 / search', detail: 'Focused 30-day sourcing and partner-led vetting.' },
              { name: 'Talent Partner', price: '$3,000 / month', detail: 'Continuous hiring support and custom pipeline creation.' },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-3xl border p-6 flex flex-col justify-between ${
                  plan.highlight
                    ? 'border-[#fa7d22]/30 bg-gradient-to-b from-[#fa7d22]/10 to-transparent'
                    : 'border-white/10 bg-white/[0.01]'
                }`}
              >
                <div>
                  <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                  <p className="text-3xl font-extrabold text-white mt-2">{plan.price}</p>
                  <p className="text-xs text-white/50 mt-4 leading-relaxed">{plan.detail}</p>
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-6 w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-xs font-semibold cursor-not-allowed bg-white/[0.02]"
                >
                  Coming soon
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : activeOpp ? (
        <div className="space-y-6">
          {activeOpp.status === 'hired' ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-200">Role filled</p>
                <p className="text-xs text-white/60 mt-1">This search is complete. Start your next role when ready.</p>
              </div>
              <button
                onClick={onNewSearchClick}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-sm font-semibold"
              >
                Start next role
              </button>
            </div>
          ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
          
          {/* Matches Feed Area */}
          <div className="space-y-6">
            
            {/* Matches stats and filters */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-xl text-white">Matched Builders</h3>
                {activeShortlist ? (
                  <p className="text-xs text-white/40 mt-1 font-medium">
                    Found {activeShortlist.totalMatches} matches · {activeShortlist.strongMatchCount} strong fit matches
                  </p>
                ) : (
                  <p className="text-xs text-white/45 mt-1 font-medium">Analyzing proof-of-work graph...</p>
                )}
              </div>

              {activeShortlist?.unlocked && (
                <div className="flex border border-white/10 rounded-xl bg-white/[0.02] p-1 text-xs shrink-0">
                  <button
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                      filterTab === 'all' ? 'bg-[#fa7d22] text-black' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    All Fits
                  </button>
                  <button
                    onClick={() => setFilterTab('saved')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                      filterTab === 'saved' ? 'bg-[#fa7d22] text-black' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Saved ({activeShortlist.fullCandidates?.filter((c) => c.saved).length || 0})
                  </button>
                </div>
              )}
            </div>

            {/* Shortlist Unlock Alert Banner (if locked) */}
            {activeShortlist && !activeShortlist.unlocked && (
              <div className="rounded-3xl border border-[#fa7d22]/30 bg-gradient-to-r from-[#fa7d22]/10 to-[#0e1012] p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="max-w-md">
                  <h4 className="text-[#ffb580] font-semibold text-sm">Reviewing Anonymous Match Preview</h4>
                  <p className="text-xs text-white/70 mt-1 leading-relaxed">
                    Verify matched builder metrics and interesting facts above. Unlock the shortlist to access names, real portfolios, Github proof links, and request introductions.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={unlockBusy === currentOppId}
                  onClick={() => currentOppId && unlockShortlist(currentOppId)}
                  className="px-5 py-2.5 rounded-xl bg-[#fa7d22] text-black text-xs font-bold hover:bg-[#ff9b4e] disabled:opacity-60 transition"
                >
                  {unlockBusy === currentOppId ? 'Unlocking...' : 'Unlock Shortlist ($499)'}
                </button>
              </div>
            )}

            {/* Cards Grid */}
            {candidateFeed.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
                <Bot className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <p className="text-white/50 text-sm">
                  {filterTab === 'saved'
                    ? 'No saved candidates yet. Tap the heart icon on cards to save them.'
                    : 'Building match brief. Wait a moment or edit stack inputs.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {candidateFeed.map((cand, idx) => (
                  <BuilderSnapshotCard
                    key={cand.anonymousLabel || cand.builderId || idx}
                    candidate={cand}
                    unlocked={activeShortlist?.unlocked || false}
                    onViewDetails={() => onExploreCandidate(cand, currentOppId!)}
                    onRequestIntro={() => onRequestIntro(cand, currentOppId!)}
                    onUnlock={() => currentOppId && unlockShortlist(currentOppId)}
                    onSave={() =>
                      activeShortlist?.unlocked &&
                      runCandidateAction(currentOppId!, cand.builderId, 'save')
                    }
                    onHide={() =>
                      activeShortlist?.unlocked &&
                      runCandidateAction(currentOppId!, cand.builderId, 'hide')
                    }
                    actionBusy={candidateActionBusy}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Hiring Pipeline Tracker Pane */}
          <aside className="rounded-3xl border border-white/10 bg-white/[0.01] p-5 space-y-5 lg:sticky lg:top-8">
            <div className="flex items-center gap-2 border-b border-white/5 pb-4">
              <Activity className="w-5 h-5 text-[#fa7d22]" />
              <h3 className="font-bold text-lg text-white">Active Pipeline</h3>
            </div>

            {rolePipelineEntries.length === 0 ? (
              <div className="py-6 text-center text-white/40 text-xs leading-relaxed">
                No candidates in active pipeline stages for this role yet. Shortlist matches and request introductions to track them here.
              </div>
            ) : (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                {PIPELINE_STATUS_OPTIONS.map((opt) => {
                  const entries = groupedRolePipeline[opt.value] || [];
                  if (entries.length === 0) return null;
                  
                  return (
                    <div key={opt.value} className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold">
                        {opt.label} ({entries.length})
                      </p>
                      
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <div
                            key={entry.matchRecordId}
                            className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <p className="font-bold text-sm text-white">{entry.candidateName}</p>
                                <p className="text-[10px] text-white/40 font-semibold mt-0.5 truncate">{entry.nextStep}</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border shrink-0 ${statusColors[entry.status] || ''}`}>
                                {entry.statusLabel}
                              </span>
                            </div>
                            
                            {/* Pipeline fast actions */}
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                {entry.status === 'builder_interested' ? (
                                  <button
                                    type="button"
                                    disabled={pipelineBusy}
                                    onClick={() => onPipelineScheduleCall(entry)}
                                    className="px-2 py-1 rounded-lg bg-[#fa7d22] text-black text-[10px] font-bold"
                                  >
                                    Schedule call
                                  </button>
                                ) : null}
                                {entry.callScheduleStatus === 'pending_founder' ? (
                                  <button
                                    type="button"
                                    disabled={pipelineBusy}
                                    onClick={() => onPipelineScheduleCall(entry)}
                                    className="px-2 py-1 rounded-lg bg-[#fa7d22] text-black text-[10px] font-bold"
                                  >
                                    Confirm time
                                  </button>
                                ) : null}
                                {entry.callScheduleStatus === 'confirmed' && !entry.callCompletedAt ? (
                                  <button
                                    type="button"
                                    disabled={pipelineBusy}
                                    onClick={() => onPipelineCompleteCall(entry.opportunityId, entry.builderId)}
                                    className="px-2 py-1 rounded-lg border border-white/15 text-white text-[10px] font-semibold"
                                  >
                                    Call done
                                  </button>
                                ) : null}
                                {entry.callCompletedAt && entry.status === 'interviewing' ? (
                                  <button
                                    type="button"
                                    disabled={pipelineBusy}
                                    onClick={() => onPipelineHire(entry, true)}
                                    className="px-2 py-1 rounded-lg bg-emerald-500 text-black text-[10px] font-bold"
                                  >
                                    Hire
                                  </button>
                                ) : null}
                                {entry.trialProjectStatus === 'submitted' ? (
                                  <button
                                    type="button"
                                    disabled={pipelineBusy}
                                    onClick={() => {
                                      const cand = activeShortlist?.fullCandidates?.find(
                                        (c) => c.builderId === entry.builderId
                                      );
                                      onPipelineReviewTrial(entry, cand);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-[#fa7d22] text-black text-[10px] font-bold"
                                  >
                                    Review trial
                                  </button>
                                ) : null}
                                {entry.status === 'offer' ? (
                                  <button
                                    type="button"
                                    disabled={pipelineBusy}
                                    onClick={() => onPipelineHire(entry, false)}
                                    className="px-2 py-1 rounded-lg bg-emerald-500 text-black text-[10px] font-bold"
                                  >
                                    Hire
                                  </button>
                                ) : null}
                              </div>
                              <div className="flex gap-2">
                              <select
                                disabled={pipelineBusy}
                                value={entry.status}
                                onChange={(e) =>
                                  updatePipelineStatus(
                                    entry.opportunityId,
                                    entry.builderId,
                                    e.target.value
                                  )
                                }
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0e1012] border border-white/10 text-white text-[11px] font-semibold focus:outline-none"
                              >
                                {PIPELINE_STATUS_OPTIONS.map((statusOpt) => (
                                  <option key={statusOpt.value} value={statusOpt.value}>
                                    {statusOpt.label}
                                  </option>
                                ))}
                              </select>
                              
                              <button
                                onClick={() => onExplorePipelineEntry(entry)}
                                className="py-1 px-2.5 rounded-lg border border-white/10 hover:bg-white/5 text-white/70 text-[11px] font-semibold transition"
                              >
                                View Profile
                              </button>
                            </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center my-12">
          <Bot className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="font-bold text-lg text-white">No role briefs created yet</h3>
          <p className="text-white/50 text-sm max-w-sm mx-auto mt-2 leading-relaxed">
            Create your first job specification search. We'll outline your candidate profile targets and scan our student developer graph.
          </p>
          <button
            onClick={onNewSearchClick}
            className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-[#fa7d22] to-[#ff9b4e] text-black font-bold hover:opacity-95 shadow-md shadow-[#fa7d22]/10 transition inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4 stroke-[3px]" />
            Start Search Brief
          </button>
        </div>
      )}
    </div>
  );
}
