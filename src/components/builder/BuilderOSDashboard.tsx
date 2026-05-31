import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth_manager';
import { agentStorageKey, clearAgentStorageForUser, sanitizeAgentMessages } from '@/lib/talent/builderChatHelpers';
import { useTalentRealtime } from '@/hooks/useTalentRealtime';
import type { NotificationItem } from '@/components/founder/founderTypes';
import { OsShell } from '@/components/os';
import { LoaderFour } from '@/components/ui/loader';
import { BlurFade } from '@/components/ui/blur-fade';
import BuilderSidebar from './BuilderSidebar';
import BuilderHomeTab from './BuilderHomeTab';
import BuilderProjectsTab from './BuilderProjectsTab';
import BuilderMatchesTab from './BuilderMatchesTab';
import BuilderMessagesTab from './BuilderMessagesTab';
import BuilderCallsTab from './BuilderCallsTab';
import BuilderTrialsTab from './BuilderTrialsTab';
import BuilderAgentTab from './BuilderAgentTab';
import BuilderProfileTab from './BuilderProfileTab';
import BuilderEventsTab from './BuilderEventsTab';
import type {
  AgentMessage,
  BuilderData,
  BuilderDashboardContext,
  MatchData,
  ProjectData,
  ProjectStats,
  TabKey,
  UiBlock,
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
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [messagesThreadId, setMessagesThreadId] = useState<string | null>(null);
  const [messagesIntroId, setMessagesIntroId] = useState<string | null>(null);
  const [uiBlocks, setUiBlocks] = useState<UiBlock[]>([]);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [settingsHours, setSettingsHours] = useState('');
  const [settingsRemote, setSettingsRemote] = useState('unspecified');
  const [settingsAvailable, setSettingsAvailable] = useState(true);
  const [settingsWorkTypes, setSettingsWorkTypes] = useState<string[]>([]);
  const [settingsHeadline, setSettingsHeadline] = useState('');
  const [settingsBio, setSettingsBio] = useState('');
  const [settingsGithub, setSettingsGithub] = useState('');
  const [settingsLinkedin, setSettingsLinkedin] = useState('');
  const [settingsPortfolio, setSettingsPortfolio] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const loadInFlightRef = useRef(false);
  const profileEvalRequestedRef = useRef(false);
  const hydratedUserRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Hydrate agent chat once per user — independent from dashboard data sync.
  useEffect(() => {
    if (!user?.id) return;
    if (hydratedUserRef.current === user.id) return;

    if (chatUserId && chatUserId !== user.id) {
      clearAgentStorageForUser(chatUserId);
    }

    hydratedUserRef.current = user.id;
    setChatUserId(user.id);

    try {
      const saved = localStorage.getItem(agentStorageKey(user.id));
      if (saved) {
        const cleaned = sanitizeAgentMessages(JSON.parse(saved));
        setAgentMessages(cleaned);
        localStorage.setItem(agentStorageKey(user.id), JSON.stringify(cleaned));
      } else {
        setAgentMessages([]);
      }
    } catch {
      setAgentMessages([]);
    }
  }, [user?.id, chatUserId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.id && agentMessages.length > 0) {
      const cleaned = sanitizeAgentMessages(agentMessages);
      localStorage.setItem(agentStorageKey(user.id), JSON.stringify(cleaned));
    }
  }, [agentMessages, user?.id]);

  const profileScore = builder?.profileCompletion?.profileScore ?? builder?.profileCompletion?.score ?? 0;
  const proofScore = builder?.profileCompletion?.proofScore ?? 0;
  const matchScore = builder?.profileCompletion?.matchScore ?? 0;
  const qualityScore = builder?.profileQuality?.overallScore || 0;
  const qualityLabel = builder?.profileQuality?.label || 'Needs Work';
  const unreadCount = Math.max(0, uiBlocks.length);
  const callsBadgeCount = upcomingCalls.filter((c) => c.status === 'pending_builder').length;

  const tabBadge = (key?: string) => {
    if (key === 'messages') return introInbox.filter((i) => i.status === 'requested').length;
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

  const loadDashboard = async (opts?: { silent?: boolean; seedAgentGreeting?: boolean }) => {
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

      if (data.builder && (opts?.seedAgentGreeting || !silent)) {
        setAgentMessages((prev) => {
          if (prev.length > 0) return prev;
          const missing = data.builder.profileCompletion?.missingItems?.[0];
          const ql = data.builder.profileQuality?.label || 'Needs Work';
          const base = `Hey ${data.builder.name.split(' ')[0]} — I reviewed your profile. Your quality score is ${ql}.`;
          const priority = missing ? ` The highest priority right now is to ${missing.toLowerCase()}.` : ' Your profile looks strong!';
          return [{ sender: 'agent', text: `${base}${priority} I can help you update your availability, summarize your profile, or add a project.` }];
        });
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
    loadDashboard({ seedAgentGreeting: true });
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      const validTabs: TabKey[] = ['home', 'projects', 'matches', 'messages', 'calls', 'trials', 'agent', 'profile', 'events'];
      if (tab === 'intros' || tab === 'messages') setActiveTab('messages');
      else if (tab && validTabs.includes(tab as TabKey)) setActiveTab(tab as TabKey);
      setMessagesThreadId(params.get('threadId'));
      setMessagesIntroId(params.get('introId'));
    }
  }, []);

  useTalentRealtime({
    enabled: Boolean(user?.id) && activeTab !== 'agent',
    scope: 'builder',
    onEvent: () => loadDashboard({ silent: true }),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [agentMessages, agentBusy]);

  const handleAgentSend = async (overrideText?: string) => {
    const text = (typeof overrideText === 'string' ? overrideText : agentInput).trim();
    if (!text || agentBusy) return;

    setAgentMessages((prev) => [...prev, { sender: 'user', text }]);
    if (!overrideText) setAgentInput('');
    setAgentBusy(true);

    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'builder_chat',
          payload: {
            message: text,
            history: agentMessages.map((m) => ({
              role: m.sender === 'agent' ? 'assistant' : 'user',
              content: m.text,
            })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Action failed');

      setAgentMessages((prev) => [...prev, { sender: 'agent', text: data.message || 'Done.' }]);
      setUiBlocks(Array.isArray(data.uiBlocks) ? data.uiBlocks : []);
      if (data.builder) {
        setBuilder((prev) => ({ ...(prev || {}), ...data.builder } as BuilderData));
        setSettingsHeadline(data.builder.headline || '');
        setSettingsBio(data.builder.bio || '');
        setSettingsGithub(data.builder.links?.github || '');
        setSettingsLinkedin(data.builder.links?.linkedin || '');
        setSettingsPortfolio(data.builder.links?.portfolio || '');
      }
      if (Array.isArray(data.projects)) setProjects(data.projects);
    } catch (error) {
      setAgentMessages((prev) => [
        ...prev,
        { sender: 'agent', text: error instanceof Error ? error.message : 'Agent action failed.' },
      ]);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingResume(true);
    setAgentMessages((prev) => [...prev, { sender: 'user', text: `Uploading resume: ${file.name}` }]);

    try {
      const formData = new FormData();
      formData.append('resume', file);
      const uploadResponse = await fetch('/api/agent/upload-resume', { method: 'POST', credentials: 'include', body: formData });
      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadData.success) throw new Error(uploadData.message || 'Resume upload failed');

      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'builder_chat',
          payload: {
            message: uploadData.extractedData
              ? `I uploaded my resume. Skills: ${(uploadData.extractedData.skills || []).join(', ')}.`
              : 'I uploaded my resume',
            attachments: { resumeUrl: uploadData.resumeUrl },
            history: agentMessages.map((m) => ({ role: m.sender === 'agent' ? 'assistant' : 'user', content: m.text })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Resume update failed');

      setAgentMessages((prev) => [...prev, { sender: 'agent', text: data.message || 'Resume added.' }]);
      setUiBlocks(Array.isArray(data.uiBlocks) ? data.uiBlocks : []);
      if (data.builder) setBuilder((prev) => ({ ...(prev || {}), ...data.builder } as BuilderData));
    } catch (error) {
      setAgentMessages((prev) => [
        ...prev,
        { sender: 'agent', text: error instanceof Error ? error.message : 'Failed to upload resume.' },
      ]);
    } finally {
      setUploadingResume(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
      setAgentMessages((prev) => [...prev, { sender: 'agent', text: 'Settings updated successfully.' }]);
      setActiveTab('agent');
    } catch (error) {
      setAgentMessages((prev) => [
        ...prev,
        { sender: 'agent', text: error instanceof Error ? error.message : 'Failed to save settings.' },
      ]);
      setActiveTab('agent');
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
    agentMessages,
    agentInput,
    agentBusy,
    refreshing,
    uiBlocks,
    uploadingResume,
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
    unreadCount,
    topRoles,
    topSkills,
    setActiveTab,
    setAgentInput,
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
    handleAgentSend,
    handleResumeUpload,
    saveSettings,
    loadDashboard,
    logout,
    fileInputRef,
    messagesEndRef,
    tabBadge,
  };

  const tabContent = {
    home: <BuilderHomeTab ctx={ctx} />,
    projects: <BuilderProjectsTab ctx={ctx} />,
    matches: <BuilderMatchesTab ctx={ctx} />,
    messages: <BuilderMessagesTab ctx={ctx} />,
    calls: <BuilderCallsTab ctx={ctx} />,
    trials: <BuilderTrialsTab ctx={ctx} />,
    events: <BuilderEventsTab ctx={ctx} />,
    agent: <BuilderAgentTab ctx={ctx} />,
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
            matchScore={matchScore}
            projectsCount={projects.length}
            notifications={notifications}
            unreadNotificationCount={unreadNotificationCount}
            unreadAgentCount={unreadCount}
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
