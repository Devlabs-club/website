import React, { useState, useMemo } from 'react';
import type { Opportunity, PublicShortlist, FullCandidate, FounderPipeline, PipelineEntry, NotificationItem, FounderBillingState } from './founderTypes';
import FounderKanbanBoard from './FounderKanbanBoard';
import NotificationCenter from '../talent/NotificationCenter';
import MessagesPanel from '../talent/MessagesPanel';
import { OsButton } from '@/components/os';
import { Bot, Plus, ChevronDown, Briefcase, CreditCard, MessageSquare, LogOut, RefreshCw, Pencil, Trash2 } from 'lucide-react';
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
  billing?: FounderBillingState | null;
  onPipelineScheduleCall: (entry: PipelineEntry) => void;
  onPipelineCompleteCall: (opportunityId: string, builderId: string) => void;
  onPipelineHire: (entry: PipelineEntry, skipTrial?: boolean) => void;
  onPipelineReviewTrial: (entry: PipelineEntry, candidate: FullCandidate | undefined) => void;
  onExplorePipelineEntry: (entry: PipelineEntry) => void;
  onGenerateTrial?: (candidate: FullCandidate, opportunityId: string) => void;
  onHireCandidate?: (candidate: FullCandidate, opportunityId: string) => void;
  onRerunSearch?: (opportunityId: string) => void;
  onEditSearch?: (opportunityId: string) => void;
  onArchiveSearch?: (opportunityId: string) => void;
  searchActionBusy?: boolean;
  onKanbanRefresh?: () => void;
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
  billing,
  onPipelineScheduleCall,
  onPipelineCompleteCall,
  onPipelineHire,
  onPipelineReviewTrial,
  onExplorePipelineEntry,
  onGenerateTrial,
  onHireCandidate,
  onRerunSearch,
  onEditSearch,
  onArchiveSearch,
  searchActionBusy,
  onKanbanRefresh,
}: FounderUnifiedWorkspaceProps) {
  const { user } = useAuth();
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'cockpit' | 'messages'>('cockpit');
  const [billingBusy, setBillingBusy] = useState<string | null>(null);

  const openCheckout = async (plan: 'growth' | 'custom', interval: 'monthly' | 'yearly' = 'monthly') => {
    setBillingBusy(`${plan}:${interval}`);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan, interval }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.url) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Checkout failed');
    } finally {
      setBillingBusy(null);
    }
  };

  const openBillingPortal = async () => {
    setBillingBusy('portal');
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.url) throw new Error(data.error || 'Billing portal unavailable');
      window.location.href = data.url;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Billing portal unavailable');
    } finally {
      setBillingBusy(null);
    }
  };

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

  const kanbanCandidates = useMemo(() => {
    if (!activeShortlist?.fullCandidates?.length) return [];
    return (activeShortlist.fullCandidates as FullCandidate[]).filter((c) => !c.hidden);
  }, [activeShortlist]);

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

          {/* Messages toggle */}
          <button
            onClick={() => setWorkspaceView(workspaceView === 'messages' ? 'cockpit' : 'messages')}
            className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition ${
              workspaceView === 'messages'
                ? 'border-[#fa7d22]/40 bg-[#fa7d22]/10 text-[#ffb580]'
                : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Messages
          </button>

          {/* New Search CTA */}
          <OsButton variant="shimmer" onClick={onNewSearchClick} className="text-sm py-2.5 px-4 flex items-center gap-1.5">
            <Plus className="w-4 h-4 stroke-[3px]" />
            New Search
          </OsButton>

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
      {workspaceView === 'messages' ? (
        <div className="space-y-4 animate-fade-in">
          <div>
            <h2 className="text-2xl font-bold">Messages</h2>
            <p className="text-white/60 text-sm mt-1">Chat with builders about roles, intros, and trials.</p>
          </div>
          <MessagesPanel viewer="founder" />
        </div>
      ) : showBilling ? (
        <div className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-2xl font-bold">Billing</h2>
            <p className="text-white/60 text-sm mt-1">Current plan: {billing?.entitlements.plan || 'free'}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Monthly role usage</p>
                <p className="text-xs text-white/45 mt-1">
                  {billing?.usage.rolesUsed ?? 0}
                  {billing?.usage.roleLimit === null ? ' / unlimited' : ` / ${billing?.usage.roleLimit ?? 3}`} roles this month
                </p>
              </div>
              <div className="text-xs text-white/45">
                {billing?.entitlements.profileLimitPerRole === null
                  ? 'Unlimited profiles per role'
                  : `${billing?.entitlements.profileLimitPerRole ?? 5} profiles per role`}
              </div>
            </div>
            {billing?.usage.roleLimit ? (
              <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#fa7d22]"
                  style={{ width: `${Math.min(100, ((billing.usage.rolesUsed || 0) / billing.usage.roleLimit) * 100)}%` }}
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                id: 'free',
                name: 'Explore',
                price: 'Free',
                detail: '3 roles/month, 5 profiles/role, proof links, and premium teasers.',
                features: ['GitHub, LinkedIn, portfolios', 'Trace previews', 'Intro draft hook'],
              },
              {
                id: 'growth',
                name: 'Growth',
                price: '$20/mo',
                detail: '5 roles/month, 20 profiles/role, full traces, intros, calls, trials, and hiring.',
                features: ['Full agent traces', 'Builder outreach', 'Hiring pipeline'],
                highlight: true,
              },
              {
                id: 'custom',
                name: 'Custom',
                price: '$499 deposit',
                detail: 'Unlimited roles and profiles with DevLabs managing the search to signed offer.',
                features: ['Unlimited searches', 'Warm introductions', 'Success-based hiring'],
              },
            ].map((plan) => (
              <div
                key={plan.id}
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
                  <div className="mt-5 space-y-2">
                    {plan.features.map((feature) => (
                      <p key={feature} className="text-xs text-white/65">{feature}</p>
                    ))}
                  </div>
                </div>
                {plan.id === billing?.entitlements.plan ? (
                  <button
                    type="button"
                    onClick={billing?.entitlements.plan === 'growth' ? openBillingPortal : undefined}
                    disabled={billing?.entitlements.plan !== 'growth' || billingBusy === 'portal'}
                    className="mt-6 w-full py-2.5 rounded-xl border border-white/10 text-white/55 text-xs font-semibold bg-white/[0.02] disabled:cursor-default"
                  >
                    {billing?.entitlements.plan === 'growth' ? 'Manage billing' : 'Current plan'}
                  </button>
                ) : plan.id === 'growth' ? (
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={Boolean(billingBusy)}
                      onClick={() => openCheckout('growth', 'monthly')}
                      className="py-2.5 rounded-xl bg-[#fa7d22] text-black text-xs font-bold disabled:opacity-50"
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(billingBusy)}
                      onClick={() => openCheckout('growth', 'yearly')}
                      className="py-2.5 rounded-xl border border-[#fa7d22]/40 text-[#ffb580] text-xs font-bold disabled:opacity-50"
                    >
                      Yearly
                    </button>
                  </div>
                ) : plan.id === 'custom' ? (
                  <button
                    type="button"
                    disabled={Boolean(billingBusy)}
                    onClick={() => openCheckout('custom')}
                    className="mt-6 w-full py-2.5 rounded-xl border border-white/15 text-white/75 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
                  >
                    Start with deposit
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="mt-6 w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-xs font-semibold cursor-not-allowed bg-white/[0.02]"
                  >
                    Current baseline
                  </button>
                )}
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

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-xl text-white">Hiring pipeline</h3>
              {activeShortlist ? (
                <p className="text-xs text-white/40 mt-1 font-medium">
                  {activeShortlist.totalMatches} matches · {activeShortlist.strongMatchCount} strong fits · drag cards across columns
                </p>
              ) : (
                <p className="text-xs text-white/45 mt-1 font-medium">Analyzing proof-of-work graph...</p>
              )}
            </div>

            {currentOppId ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={searchActionBusy}
                  onClick={() => onRerunSearch?.(currentOppId)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${searchActionBusy ? 'animate-spin' : ''}`} />
                  {searchActionBusy ? 'Searching…' : 'Search again'}
                </button>
                <button
                  type="button"
                  disabled={searchActionBusy}
                  onClick={() => onEditSearch?.(currentOppId)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit brief
                </button>
                <button
                  type="button"
                  disabled={searchActionBusy}
                  onClick={() => onArchiveSearch?.(currentOppId)}
                  className="px-3 py-1.5 rounded-lg border border-red-500/20 text-xs font-semibold text-red-300/80 hover:bg-red-500/10 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete search
                </button>
              </div>
            ) : null}
          </div>

          {/* Unlock banner removed — shortlist is always accessible */}

          {currentOppId && activeShortlist && kanbanCandidates.length > 0 ? (
            <FounderKanbanBoard
              candidates={kanbanCandidates}
              pipelineEntries={rolePipelineEntries}
              opportunityId={currentOppId}
              busy={pipelineBusy || candidateActionBusy}
              matchesLoading={searchActionBusy}
              onViewCandidate={(c) => onExploreCandidate(c, currentOppId)}
              onRequestIntro={(c) => onRequestIntro(c, currentOppId)}
              onScheduleCall={onPipelineScheduleCall}
              onGenerateTrial={(c) => onGenerateTrial?.(c, currentOppId)}
              onHire={async (c) => onHireCandidate?.(c, currentOppId)}
              onReviewTrial={(c) => {
                const entry = rolePipelineEntries.find((e) => e.builderId === c.builderId);
                if (entry) onPipelineReviewTrial(entry, c);
              }}
              onMovedToInterviewing={onKanbanRefresh}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
              <Bot className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 text-sm">Run a search to populate your matches column.</p>
            </div>
          )}
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
