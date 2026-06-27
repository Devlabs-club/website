import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth_manager';
import { useTalentRealtime } from '@/hooks/useTalentRealtime';
import type { NotificationItem } from '@/components/founder/founderTypes';
import { OsShell } from '@/components/os';
import { LoaderFour } from '@/components/ui/loader';
import { BlurFade } from '@/components/ui/blur-fade';
import BuilderSidebar from './BuilderSidebar';
import BuilderHomeTab from './BuilderHomeTab';
import BuilderIntrosTab from './BuilderIntrosTab';
import BuilderMessagesTab from './BuilderMessagesTab';
import BuilderCallsTab from './BuilderCallsTab';
import BuilderTrialsTab from './BuilderTrialsTab';
import BuilderProfileTab from './BuilderProfileTab';
import type {
  BuilderData,
  BuilderDashboardContext,
  MatchData,
  ProjectData,
  ProjectStats,
  TabKey,
} from './types';

export default function BuilderOSDashboard() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [builder, setBuilder] = useState<BuilderData | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [introInbox, setIntroInbox] = useState<any[]>([]);
  const [activeTrials, setActiveTrials] = useState<any[]>([]);
  const [upcomingCalls, setUpcomingCalls] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [projectStats, setProjectStats] = useState<ProjectStats>({
    total: 0,
    devpostImports: 0,
    githubProjects: 0,
    verifiedContributions: 0,
  });
  const [messagesThreadId, setMessagesThreadId] = useState<string | null>(null);
  const [messagesIntroId, setMessagesIntroId] = useState<string | null>(null);
  const [settingsHours, setSettingsHours] = useState('');
  const [settingsRemote, setSettingsRemote] = useState('unspecified');
  const [settingsAvailable, setSettingsAvailable] = useState(true);
  const [settingsWorkTypes, setSettingsWorkTypes] = useState<string[]>([]);
  const [settingsHeadline, setSettingsHeadline] = useState('');
  const [settingsBio, setSettingsBio] = useState('');
  const [settingsGithub, setSettingsGithub] = useState('');
  const [settingsLinkedin, setSettingsLinkedin] = useState('');
  const [settingsPortfolio, setSettingsPortfolio] = useState('');

  const loadInFlightRef = useRef(false);
  const profileEvalRequestedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const profileScore = builder?.profileCompletion?.profileScore ?? builder?.profileCompletion?.score ?? 0;
  const proofScore = builder?.profileCompletion?.proofScore ?? 0;
  const matchScore = builder?.profileCompletion?.matchScore ?? 0;
  const qualityScore = builder?.profileQuality?.overallScore || 0;
  const qualityLabel = builder?.profileQuality?.label || 'Needs Work';
  const callsBadgeCount = upcomingCalls.filter((c) => c.status === 'pending_builder').length;

  const tabBadge = (key?: string) => {
    if (key === 'intros') return introInbox.filter((i) => i.status === 'requested' || !i.viewedAt).length;
    if (key === 'messages') return 0;
    if (key === 'calls') return callsBadgeCount;
    if (key === 'trials')
      return activeTrials.filter((t) => ['sent', 'rejected'].includes(t.trialProject?.status)).length;
    return 0;
  };

  const topRoles = useMemo(
    () => (Array.isArray(builder?.rolePreference) ? builder.rolePreference.slice(0, 3) : []),
    [builder]
  );

  const topSkills = useMemo(() => {
    const projectSkills = projects.flatMap((project) => project.techStack || []);
    return Array.from(new Set(projectSkills.filter(Boolean))).slice(0, 8);
  }, [projects]);

  const loadDashboard = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);

    if (silent && loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    if (silent) setRefreshing(true);
    else setLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ action: 'get_builder_dashboard', payload: {} }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load dashboard');

      setBuilder(data.builder || null);
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setMatches(Array.isArray(data.matches) ? data.matches : []);
      setIntroInbox(Array.isArray(data.introInbox) ? data.introInbox : []);
      setActiveTrials(Array.isArray(data.activeTrials) ? data.activeTrials : []);
      setUpcomingCalls(Array.isArray(data.upcomingCalls) ? data.upcomingCalls : []);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadNotificationCount(typeof data.unreadNotificationCount === 'number' ? data.unreadNotificationCount : 0);
      setProjectStats(
        data.projectStats || { total: 0, devpostImports: 0, githubProjects: 0, verifiedContributions: 0 }
      );

      if (
        !silent &&
        data.builder?.profileQuality?.source === 'deterministic' &&
        !profileEvalRequestedRef.current
      ) {
        profileEvalRequestedRef.current = true;
        fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'evaluate_profile_quality', payload: {} }),
        })
          .then((res) => res.json())
          .then((evalData) => {
            if (evalData.success && evalData.builder) setBuilder(evalData.builder);
          })
          .catch(console.error);
      }

      if (data.builder?.availability) {
        setSettingsHours(data.builder.availability.hoursPerWeek ? String(data.builder.availability.hoursPerWeek) : '');
        setSettingsRemote(data.builder.availability.remotePreference || 'unspecified');
        setSettingsAvailable(Boolean(data.builder.availability.availableNow));
      }
      if (data.builder) {
        setSettingsHeadline(data.builder.headline || '');
        setSettingsBio(data.builder.bio || '');
        setSettingsGithub(data.builder.links?.github || '');
        setSettingsLinkedin(data.builder.links?.linkedin || '');
        setSettingsPortfolio(data.builder.links?.portfolio || '');
      }
      setSettingsWorkTypes(Array.isArray(data.builder?.preferredWorkType) ? data.builder.preferredWorkType : []);
      if (!silent) setLoadError(null);
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Dashboard load timed out. Please refresh the page.'
          : error instanceof Error
            ? error.message
            : 'Could not load dashboard.';
      if (silent) {
        console.warn('[BuilderOS] Background sync failed:', message);
      } else {
        setLoadError(message);
      }
    } finally {
      clearTimeout(timeoutId);
      loadInFlightRef.current = false;
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      const validTabs: TabKey[] = ['home', 'intros', 'messages', 'calls', 'trials', 'profile'];
      if (tab === 'matches' || tab === 'projects' || tab === 'events') setActiveTab('home');
      else if (tab === 'intros') setActiveTab('intros');
      else if (tab && validTabs.includes(tab as TabKey)) setActiveTab(tab as TabKey);
      setMessagesThreadId(params.get('threadId'));
      setMessagesIntroId(params.get('introId'));
    }
  }, []);

  useTalentRealtime({
    enabled: Boolean(user?.id),
    scope: 'builder',
    onEvent: () => loadDashboard({ silent: true }),
  });

  const saveSettings = async () => {
    try {
      for (const [action, payload] of [
        ['update_availability', { availableNow: settingsAvailable, hoursPerWeek: settingsHours ? Number(settingsHours) : null, remotePreference: settingsRemote }],
        ['update_work_preferences', { preferredWorkTypes: settingsWorkTypes, availableNow: settingsAvailable }],
        ['update_profile_basics', { headline: settingsHeadline, bio: settingsBio }],
        ['update_links', { github: settingsGithub, linkedin: settingsLinkedin, portfolio: settingsPortfolio }],
      ] as const) {
        const res = await fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action, payload }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || `Failed to save ${action}`);
      }
      setActiveTab('profile');
    } catch (error) {
      console.error('[BuilderOSDashboard] save settings failed', error);
      setActiveTab('profile');
    }
  };

  const toggleWorkType = (value: string) => {
    setSettingsWorkTypes((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  if (loading) {
    return (
      <OsShell className="items-center justify-center p-10">
        <LoaderFour text="Loading dashboard" />
      </OsShell>
    );
  }

  if (!builder) {
    return (
      <OsShell className="items-center justify-center p-10">
        <p className="text-white/70">No builder profile found for this account.</p>
      </OsShell>
    );
  }

  const ctx: BuilderDashboardContext = {
    user,
    builder,
    projects,
    matches,
    introInbox,
    activeTrials,
    upcomingCalls,
    notifications,
    unreadNotificationCount,
    projectStats,
    refreshing,
    messagesThreadId,
    messagesIntroId,
    settingsHours,
    settingsRemote,
    settingsAvailable,
    settingsWorkTypes,
    settingsHeadline,
    settingsBio,
    settingsGithub,
    settingsLinkedin,
    settingsPortfolio,
    profileScore,
    proofScore,
    matchScore,
    qualityScore,
    qualityLabel,
    topRoles,
    topSkills,
    setActiveTab,
    setMessagesThreadId,
    setMessagesIntroId,
    setSettingsHours,
    setSettingsRemote,
    setSettingsAvailable,
    setSettingsHeadline,
    setSettingsBio,
    setSettingsGithub,
    setSettingsLinkedin,
    setSettingsPortfolio,
    toggleWorkType,
    saveSettings,
    loadDashboard,
    logout,
    tabBadge,
  };

  const tabContent = {
    home: <BuilderHomeTab ctx={ctx} />,
    intros: <BuilderIntrosTab ctx={ctx} />,
    messages: <BuilderMessagesTab ctx={ctx} />,
    calls: <BuilderCallsTab ctx={ctx} />,
    trials: <BuilderTrialsTab ctx={ctx} />,
    profile: <BuilderProfileTab ctx={ctx} />,
  }[activeTab];

  return (
    <OsShell>
      <div className="w-full max-w-[1600px] mx-auto px-4 xl:px-10 pt-8 pb-12 flex-1">
        {loadError ? (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-amber-100">{loadError}</p>
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="text-sm font-medium text-[#ffb580] hover:text-white shrink-0"
            >
              Retry
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-8 items-start">
          <BuilderSidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            builder={builder}
            userEmail={user?.email}
            profileScore={profileScore}
            proofScore={proofScore}
            projectsCount={projects.length}
            notifications={notifications}
            unreadNotificationCount={unreadNotificationCount}
            tabBadge={tabBadge}
            logout={logout}
          />
          <section className="min-h-[calc(100vh-64px)] flex flex-col rounded-3xl">
            <BlurFade key={activeTab} delay={0.02}>
              {tabContent}
            </BlurFade>
          </section>
        </div>
      </div>
    </OsShell>
  );
}
