import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Home, LayoutGrid, Users, Bot, User, Sparkles, Medal, Check, AlertCircle } from 'lucide-react';
import { AuthProvider, useAuth } from './auth_manager';
import AdminDashboard from './AdminDashboard';
import { DottedGlowBackground } from './ui/dotted-glow-background';

type BuilderData = {
  _id: string;
  name: string;
  email: string;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  rolePreference?: string[];
  preferredWorkType?: string[];
  links?: { github?: string | null; linkedin?: string | null; portfolio?: string | null; devpost?: string | null; resume?: string | null };
  availability?: { availableNow?: boolean; hoursPerWeek?: number | null; remotePreference?: string | null; salaryExpectationMin?: number | null; salaryExpectationMax?: number | null; earliestStartDate?: string | null };
  profileCompletion?: { score?: number; profileScore?: number; proofScore?: number; matchScore?: number; missingItems?: string[]; eligibility?: string };
  profileQuality?: {
    overallScore?: number;
    label?: string;
    oneLineSummary?: string;
    founderClarity?: { score?: number; label?: string; summary?: string };
    strengths?: Array<{ title?: string; detail?: string }>;
    issues?: Array<{ field?: string; severity?: string; title?: string; detail?: string }>;
    suggestedFixes?: Array<{ field?: string; priority?: string; action?: string; example?: string }>;
    source?: string;
  };
  visibilityStatus?: 'public' | 'matched_only' | 'hidden';
};

type ProjectData = {
  _id: string;
  projectName: string;
  description?: string;
  techStack?: string[];
  links?: { github?: string; demo?: string; devpost?: string; screenshots?: string };
  source?: string;
  verificationStatus?: string;
};

type ProjectStats = {
  total: number;
  devpostImports: number;
  githubProjects: number;
  verifiedContributions: number;
};

type MatchData = {
  _id: string;
  matchScore: number;
  status: string;
  reasoning?: string;
  opportunityId?: string;
  roleTitle?: string;
  company?: string;
  matchLabel?: 'strong' | 'good' | 'possible' | 'needs_more_proof';
  missingProof?: string[];
  workType?: string[];
  compensation?: string;
  timeline?: string;
};

type AgentMessage = { sender: 'agent' | 'user'; text: string };
type UiBlock = {
  type: string;
  title?: string;
  body?: string;
  items?: string[];
  missingItems?: string[];
  score?: number;
  eligibility?: string;
};

type TabKey = 'home' | 'projects' | 'matches' | 'agent' | 'profile';

const navItems: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { key: 'projects', label: 'Proof of Work', icon: <LayoutGrid className="w-5 h-5" /> },
  { key: 'matches', label: 'Matches', icon: <Users className="w-5 h-5" /> },
  { key: 'agent', label: 'Agent', icon: <Bot className="w-5 h-5" /> },
  { key: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
];

function scoreTone(score: number) {
  if (score >= 80) return 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30';
  if (score >= 60) return 'text-amber-200 bg-amber-500/15 border-amber-400/30';
  return 'text-white/80 bg-white/10 border-white/20';
}

function getProjectImageUrl(project: ProjectData) {
  return project.links?.screenshots?.split(/[,\s|]+/).find((url) => /^https?:\/\//i.test(url));
}

function getMatchLabel(score: number) {
  if (score >= 90) return 'Match Ready';
  if (score >= 70) return 'Almost Ready';
  if (score >= 40) return 'In Progress';
  return 'Getting Started';
}

function BuilderOSDashboard() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [builder, setBuilder] = useState<BuilderData | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [momentum, setMomentum] = useState<any[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats>({ total: 0, devpostImports: 0, githubProjects: 0, verifiedContributions: 0 });
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    { sender: 'agent', text: 'Hey — I identified your profile from login. I can update it and improve your match readiness.' },
  ]);
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentModel, setAgentModel] = useState<string>('');
  const [uiBlocks, setUiBlocks] = useState<UiBlock[]>([]);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [settingsHours, setSettingsHours] = useState<string>('');
  const [settingsRemote, setSettingsRemote] = useState<string>('unspecified');
  const [settingsAvailable, setSettingsAvailable] = useState<boolean>(true);
  const [settingsWorkTypes, setSettingsWorkTypes] = useState<string[]>([]);
  const [settingsHeadline, setSettingsHeadline] = useState<string>('');
  const [settingsBio, setSettingsBio] = useState<string>('');
  const [settingsGithub, setSettingsGithub] = useState<string>('');
  const [settingsLinkedin, setSettingsLinkedin] = useState<string>('');
  const [settingsPortfolio, setSettingsPortfolio] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const profileScore = builder?.profileCompletion?.profileScore || builder?.profileCompletion?.score || 0;
  const proofScore = builder?.profileCompletion?.proofScore || 0;
  const matchScore = builder?.profileCompletion?.matchScore || 0;
  const qualityScore = builder?.profileQuality?.overallScore || 0;
  const qualityLabel = builder?.profileQuality?.label || 'Needs Work';
  const unreadCount = Math.max(0, uiBlocks.length);

  const topRoles = useMemo(() => {
    return Array.isArray(builder?.rolePreference) ? builder.rolePreference.slice(0, 3) : [];
  }, [builder]);

  const topSkills = useMemo(() => {
    const projectSkills = projects.flatMap((project) => project.techStack || []);
    return Array.from(new Set(projectSkills.filter(Boolean))).slice(0, 8);
  }, [projects]);

  const loadDashboard = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'get_builder_dashboard', payload: {} }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load dashboard');

      setBuilder(data.builder || null);
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setMatches(Array.isArray(data.matches) ? data.matches : []);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setMomentum(Array.isArray(data.momentum) ? data.momentum : []);
      setProjectStats(data.projectStats || { total: 0, devpostImports: 0, githubProjects: 0, verifiedContributions: 0 });
      setAgentModel(data.meta?.model || 'deterministic-fallback');

      // Trigger LLM evaluation in background if it's deterministic or old
      if (data.builder && data.builder.profileQuality?.source === 'deterministic') {
        fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'evaluate_profile_quality', payload: {} }),
        }).then(res => res.json()).then(evalData => {
          if (evalData.success && evalData.builder) {
            setBuilder(evalData.builder);
          }
        }).catch(console.error);
      }

      if (data.builder) {
        const qualityLabel = data.builder.profileQuality?.label || 'Needs Work';
        const missing = data.builder.profileCompletion?.missingItems?.[0];
        
        if (!silent && agentMessages.length <= 1) {
          const baseGreeting = `Hey ${data.builder.name.split(' ')[0]} — I reviewed your profile. Your quality score is ${qualityLabel}.`;
          const priorityAction = missing ? ` The highest priority right now is to ${missing.toLowerCase()}.` : ' Your profile looks strong!';
          
          setAgentMessages([
            { 
              sender: 'agent', 
              text: `${baseGreeting}${priorityAction} I can help you update your availability, summarize your profile, or add a project.`
            }
          ]);
        }
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
    } catch (error) {
      setAgentMessages((prev) => [...prev, { sender: 'agent', text: error instanceof Error ? error.message : 'Could not load dashboard.' }]);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [agentMessages, agentBusy]);

  const handleAgentSend = async (overrideText?: string) => {
    const text = (overrideText || agentInput).trim();
    if (!text || agentBusy) return;
    setAgentMessages((prev) => [...prev, { sender: 'user', text }]);
    if (!overrideText) setAgentInput('');
    setAgentBusy(true);

    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'builder_chat', payload: { message: text } }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Action failed');

      setAgentMessages((prev) => [...prev, { sender: 'agent', text: data.message || 'Done.' }]);
      setUiBlocks(Array.isArray(data.uiBlocks) ? data.uiBlocks : []);
      if (data.meta?.model) setAgentModel(data.meta.model);
      await loadDashboard({ silent: true });
    } catch (error) {
      setAgentMessages((prev) => [...prev, { sender: 'agent', text: error instanceof Error ? error.message : 'Agent action failed.' }]);
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
        body: JSON.stringify({ action: 'builder_chat', payload: { message: 'I uploaded my resume', attachments: { resumeUrl: uploadData.resumeUrl } } }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Resume update failed');

      setAgentMessages((prev) => [...prev, { sender: 'agent', text: data.message || 'Resume added.' }]);
      setUiBlocks(Array.isArray(data.uiBlocks) ? data.uiBlocks : []);
      await loadDashboard({ silent: true });
    } catch (error) {
      setAgentMessages((prev) => [...prev, { sender: 'agent', text: error instanceof Error ? error.message : 'Failed to upload resume.' }]);
    } finally {
      setUploadingResume(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveSettings = async () => {
    try {
      const availabilityResponse = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_availability',
          payload: {
            availableNow: settingsAvailable,
            hoursPerWeek: settingsHours ? Number(settingsHours) : null,
            remotePreference: settingsRemote,
          },
        }),
      });
      const availabilityData = await availabilityResponse.json();
      if (!availabilityResponse.ok || !availabilityData.success) throw new Error(availabilityData.error || 'Failed to save availability');

      const workTypeResponse = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_work_preferences',
          payload: {
            preferredWorkTypes: settingsWorkTypes,
            availableNow: settingsAvailable,
          },
        }),
      });
      const workTypeData = await workTypeResponse.json();
      if (!workTypeResponse.ok || !workTypeData.success) throw new Error(workTypeData.error || 'Failed to save work types');

      const basicsResponse = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_profile_basics',
          payload: {
            headline: settingsHeadline,
            bio: settingsBio,
          },
        }),
      });
      if (!basicsResponse.ok) throw new Error('Failed to save profile basics');

      const linksResponse = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_links',
          payload: {
            github: settingsGithub,
            linkedin: settingsLinkedin,
            portfolio: settingsPortfolio,
          },
        }),
      });
      if (!linksResponse.ok) throw new Error('Failed to save links');

      setAgentMessages((prev) => [...prev, { sender: 'agent', text: 'Settings updated successfully.' }]);
      setActiveTab('agent');
      await loadDashboard({ silent: true });
    } catch (error) {
      setAgentMessages((prev) => [...prev, { sender: 'agent', text: error instanceof Error ? error.message : 'Failed to save settings.' }]);
      setActiveTab('agent');
    }
  };

  const toggleWorkType = (value: string) => {
    setSettingsWorkTypes((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  if (loading) return <div className="min-h-screen text-white p-10">Loading dashboard…</div>;
  if (!builder) return <div className="min-h-screen text-white p-10">No builder profile found for this account.</div>;

  return (
    <div className="relative min-h-screen w-full text-white font-manrope flex flex-col">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[url('/texture.webp')] bg-cover bg-center bg-repeat" />
      <div className="fixed inset-0 z-0 pointer-events-none bg-[#090a0c]/55" />
      <div className="fixed inset-0 z-0 opacity-[0.08] mix-blend-overlay pointer-events-none" style={{ backgroundImage: "url('/noise.png')", backgroundSize: '100px 100px' }} />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-4 xl:px-10 pt-8 pb-12 flex-1 flex flex-col">
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-8 flex-1 items-start">
          <aside className="sticky top-8 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6 flex flex-col h-[calc(100vh_-_4rem)] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/10">
              <img src="/logo.png" alt="DevLabs" className="w-10 h-10" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#fa7d22] font-bold">Builder OS</p>
                <p className="text-2xl font-semibold tracking-tight leading-none mt-0.5">DevLabs</p>
              </div>
            </div>

            <div className="space-y-2 flex-1">
              {navItems.map((item) => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={`group w-full text-left rounded-2xl px-4 py-3 border transition-all duration-300 flex items-center justify-between ${active ? 'bg-gradient-to-r from-[#fa7d22]/20 to-[#fa7d22]/5 border-[#fa7d22]/40 text-[#ffb580] shadow-[0_0_20px_rgba(250,125,34,0.1)]' : 'border-transparent text-white/70 hover:bg-white/5 hover:border-white/10 hover:text-white'}`}
                  >
                    <span className="flex items-center gap-3 text-base font-medium"><span className="opacity-80 w-6 flex items-center justify-center">{item.icon}</span>{item.label}</span>
                    {item.key === 'agent' && unreadCount > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#fa7d22]/20 border border-[#fa7d22]/30 text-[#ffb580] font-semibold">{unreadCount}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 rounded-2xl border border-[#fa7d22]/25 bg-[#1a130d] p-5">
              <p className="text-[#ffb580] text-sm font-medium">Get discovered. Build your future.</p>
              <p className="text-white/70 text-sm mt-2">{projects.length === 0 ? 'Add your first project to get discovered.' : matchScore >= 80 ? 'You’re visible to matched founders.' : 'Improve your profile to get matched.'}</p>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/70 uppercase tracking-wider font-semibold">Profile</span>
                    <span className="text-white font-medium">{profileScore}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${profileScore}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/70 uppercase tracking-wider font-semibold">Proof</span>
                    <span className="text-white font-medium">{proofScore}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400" style={{ width: `${proofScore}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/70 uppercase tracking-wider font-semibold">Match</span>
                    <span className="text-white font-medium">{matchScore}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#fa7d22] to-[#ffb580]" style={{ width: `${matchScore}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between">
              <div className="overflow-hidden pr-3">
                <p className="font-semibold text-sm truncate">{builder.name}</p>
                <p className="text-white/50 text-xs truncate">{user?.email || builder.email}</p>
              </div>
              <button onClick={logout} className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-xs font-medium transition-colors shrink-0">Logout</button>
            </div>
          </aside>

          <section className="rounded-3xl   min-h-[calc(100vh-64px)] flex flex-col">
            {activeTab === 'home' && (
              <div className="space-y-6">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#fa7d22]/10 to-black/20 backdrop-blur-xl p-8 md:p-12 text-center flex flex-col items-center shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                  <div className="absolute inset-0 pointer-events-none opacity-70" style={{ maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 70%)", WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 70%)" }}>
                    <DottedGlowBackground className="w-full h-full" color="rgba(255,255,255,0.5)" glowColor="rgba(250, 125, 34, 0.75)" gap={14} radius={2} opacity={0.7} speedMin={0.3} speedMax={1} speedScale={0.8} />
                  </div>
                  <div className="relative z-10">
                    <h2 className="text-3xl md:text-5xl font-manrope tracking-tight text-white mb-4">Build your <span className="font-serif italic hero-underline text-4xl md:text-6xl text-white">proof-of-work</span></h2>
                    <p className="text-white/70 text-lg max-w-2xl mx-auto mb-8">Complete your DevLabs profile so founders can discover your skills, projects, and availability.</p>
                    <div className="flex flex-wrap items-center justify-center gap-4">
                      <button onClick={() => setActiveTab('profile')} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.04] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Improve my profile</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                      <button onClick={() => setActiveTab('projects')} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5">
                        <span className="relative z-10 drop-shadow-sm">Add a project</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Profile Quality Card */}
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-6 flex flex-col h-full shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:border-white/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-semibold">Profile Quality</h3>
                      <span className={`px-3 py-1 text-sm rounded-full border ${scoreTone(qualityScore)}`}>{qualityLabel} · {qualityScore}%</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <p className="text-sm text-white/80 leading-relaxed">
                        {builder.profileQuality?.oneLineSummary || 'Complete your profile to get matched.'}
                      </p>
                      
                      {builder.profileQuality?.strengths?.length > 0 && (
                        <div className="space-y-2 mt-4">
                          <p className="text-sm font-medium text-white/80">What looks good:</p>
                          <ul className="text-sm text-white/60 space-y-1">
                            {builder.profileQuality.strengths.slice(0, 3).map((s: any, i: number) => (
                              <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> <span>{s.title}</span></li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {builder.profileQuality?.issues?.length > 0 && (
                        <div className="space-y-2 mt-4 pt-4 border-t border-white/10">
                          <p className="text-sm font-medium text-white/80">Needs improvement:</p>
                          <ul className="text-sm text-white/60 space-y-1 list-disc list-inside">
                            {builder.profileQuality.issues.slice(0, 3).map((issue: any, i: number) => (
                              <li key={i}>{issue.title}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setAgentInput('make my profile better'); setActiveTab('agent'); }} className="mt-6 w-full py-2.5 rounded-xl bg-[#fa7d22]/10 border border-[#fa7d22]/30 text-[#fa7d22] font-medium hover:bg-[#fa7d22]/20 transition-colors">Improve profile quality</button>
                  </div>

                  {/* Founder Preview Card */}
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-6 flex flex-col h-full shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:border-white/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-semibold">Founder Preview</h3>
                      <span className={`px-3 py-1 text-xs rounded-full border ${builder.profileQuality?.founderClarity?.score >= 70 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                        Founder Clarity: {builder.profileQuality?.founderClarity?.label || 'Needs Work'}
                      </span>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <h4 className="text-lg font-semibold">{builder.name}</h4>
                        <p className="text-[#fa7d22] text-sm">{builder.rolePreference?.[0] || 'Builder'}</p>
                      </div>
                      <p className="text-sm text-white/70">
                        {builder.availability?.availableNow ? 'Open to opportunities' : 'Not currently looking'} · {builder.availability?.remotePreference?.replace('_', ' ') || 'Remote or in-person'}
                      </p>
                      <div className="space-y-2">
                        <p className="text-sm text-white/80">Preferred roles:</p>
                        <div className="flex flex-wrap gap-2">
                          {topRoles.map(role => <span key={role} className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-white/80">{role}</span>)}
                          {!topRoles.length && <span className="text-xs text-white/50">No roles listed</span>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-white/80">Top skills:</p>
                        <div className="flex flex-wrap gap-2">
                          {topSkills.slice(0, 5).map(skill => <span key={skill} className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-white/80">{skill}</span>)}
                          {!topSkills.length && <span className="text-xs text-white/50">No skills listed</span>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-white/80">Proof-of-work:</p>
                        <p className="text-sm text-white/60">{projects.length > 0 ? `${projects.length} project(s) added` : 'Missing'}</p>
                      </div>
                    </div>
                    <button onClick={() => setActiveTab('profile')} className="group relative inline-flex items-center justify-center mt-6 w-full py-3 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5">
                      <span className="relative z-10 drop-shadow-sm">Preview public profile</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Proof of Work Summary */}
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-6 flex flex-col h-full shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:border-white/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300">
                    <h3 className="text-xl font-semibold mb-4">Proof of Work</h3>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                      <div className="bg-gradient-to-br from-white/[0.06] to-transparent backdrop-blur-md border border-white/5 rounded-xl p-4 text-center">
                        <p className="text-2xl font-semibold text-white">{projectStats.total}</p>
                        <p className="text-xs text-white/60 mt-1">Projects added</p>
                      </div>
                      <div className="bg-gradient-to-br from-white/[0.06] to-transparent backdrop-blur-md border border-white/5 rounded-xl p-4 text-center">
                        <p className="text-2xl font-semibold text-white">{projectStats.verifiedContributions}</p>
                        <p className="text-xs text-white/60 mt-1">Verified Contributions</p>
                      </div>
                      <div className="bg-gradient-to-br from-white/[0.06] to-transparent backdrop-blur-md border border-white/5 rounded-xl p-4 text-center">
                        <p className="text-2xl font-semibold text-white">{projectStats.devpostImports}</p>
                        <p className="text-xs text-white/60 mt-1">Devpost Imports</p>
                      </div>
                      <div className="bg-gradient-to-br from-white/[0.06] to-transparent backdrop-blur-md border border-white/5 rounded-xl p-4 text-center">
                        <p className="text-2xl font-semibold text-white">{projectStats.githubProjects}</p>
                        <p className="text-xs text-white/60 mt-1">GitHub Projects</p>
                      </div>
                    </div>
                    {projectStats.total === 0 && (
                      <button onClick={() => setActiveTab('projects')} className="group relative inline-flex items-center justify-center mt-6 w-full py-3 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5">
                        <span className="relative z-10 drop-shadow-sm">Import from Devpost or GitHub</span>
                      </button>
                    )}
                  </div>

                  {/* Next Best Action */}
                  <div className="rounded-3xl border border-[#fa7d22]/30 bg-gradient-to-br from-[#fa7d22]/10 to-transparent p-6 flex flex-col h-full shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:border-[#fa7d22]/50 transition-all">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-6 h-6 text-[#fa7d22]" />
                      <h3 className="text-xl font-semibold text-white">Next Best Action</h3>
                    </div>
                    <div className="flex-1 space-y-4">
                      {projects.length === 0 ? (
                        <>
                          <p className="text-lg text-white/90 font-medium">Add a project that proves your {topRoles.slice(0, 3).join(', ') || 'development'} experience.</p>
                          <p className="text-sm text-white/70">Why this matters:<br/>Founders are 3x more likely to request an intro when your skills are backed by a real project.</p>
                        </>
                      ) : !builder.links?.github && !builder.links?.resume && !builder.links?.portfolio ? (
                        <>
                          <p className="text-lg text-white/90 font-medium">Add your GitHub, Portfolio, or Resume links.</p>
                          <p className="text-sm text-white/70">Why this matters:<br/>Links provide objective proof of your skills and improve your match readiness score.</p>
                        </>
                      ) : matchScore < 80 ? (
                        <>
                          <p className="text-lg text-white/90 font-medium">Improve your profile quality to reach 'Match Ready' status.</p>
                          <p className="text-sm text-white/70">Why this matters:<br/>Only high-quality profiles are shown to founders in opportunity matching.</p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg text-white/90 font-medium">You are Match Ready!</p>
                          <p className="text-sm text-white/70">Keep your availability up to date and respond to opportunities when they arrive.</p>
                        </>
                      )}
                    </div>
                    {projects.length === 0 ? (
                      <button onClick={() => setActiveTab('projects')} className="group relative inline-flex items-center justify-center w-full py-3 mt-6 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.02] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Add proof-of-work</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                    ) : !builder.links?.github && !builder.links?.resume && !builder.links?.portfolio ? (
                      <button onClick={() => setActiveTab('profile')} className="group relative inline-flex items-center justify-center w-full py-3 mt-6 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.02] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Add links</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                    ) : matchScore < 80 ? (
                      <button onClick={() => { setAgentInput('make my profile better'); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center w-full py-3 mt-6 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.02] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Improve profile quality</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'projects' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-serif italic tracking-tight">Proof of <span className="hero-underline">Work</span></h2>
                  <div className="flex gap-2">
                    <button onClick={() => setActiveTab('agent')} className="px-3 py-1.5 rounded-lg bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors">Ask Agent</button>
                  </div>
                </div>

                {projects.length ? (
                  <div className="grid grid-cols-1 gap-4">
                    {projects.map((project) => {
                      const imageUrl = getProjectImageUrl(project);
                      const verificationLabel = (project as any).verificationStatus === 'builder_confirmed' 
                        ? 'Builder Claimed' 
                        : (project as any).verificationStatus?.replace('_', ' ') || 'Self Claimed';
                      
                      return (
                        <div key={project._id} className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl hover:border-white/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300 p-5">
                          <div className="flex flex-col md:flex-row gap-5">
                            {imageUrl && (
                              <div className="w-full md:w-32 h-32 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                                <img src={imageUrl} alt={`${project.projectName} preview`} className="h-full w-full object-cover" loading="lazy" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <h3 className="text-xl font-semibold text-white">{project.projectName}</h3>
                                  <p className="text-sm text-white/70 mt-1">{project.description || 'No description yet.'}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2 shrink-0">
                                  <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-full bg-white/5 border border-white/10 text-white/70">
                                    {verificationLabel}
                                  </span>
                                  {project.source && (
                                    <span className="text-[10px] text-white/40 uppercase tracking-wider">
                                      {project.source.replace('_', ' ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Your Contribution</p>
                                {(project as any).builderContribution ? (
                                  <p className="text-sm text-white/90 leading-relaxed">{(project as any).builderContribution}</p>
                                ) : (
                                  <div className="flex items-center gap-2 text-amber-400/90 text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>Contribution missing. Add what you personally built.</span>
                                    <button onClick={() => { setAgentInput(`Add my contribution to ${project.projectName}`); setActiveTab('agent'); }} className="ml-auto text-xs underline underline-offset-2 hover:text-amber-300">Fix with Agent</button>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Skills Proven</p>
                                  <div className="flex flex-wrap gap-2">
                                    {(project.techStack || []).slice(0, 6).map((tech) => <span key={`${project._id}-${tech}`} className="text-xs px-2 py-1 rounded-md bg-[#fa7d22]/10 border border-[#fa7d22]/20 text-[#fa7d22]">{tech}</span>)}
                                    {!(project.techStack || []).length && <span className="text-xs text-white/40">None specified</span>}
                                  </div>
                                </div>
                                <div className="flex gap-4 text-sm mt-auto">
                                  {project.links?.demo && <a href={project.links.demo} target="_blank" rel="noreferrer" className="text-white/60 hover:text-white flex items-center gap-1"><span className="underline underline-offset-4">Demo</span> ↗</a>}
                                  {project.links?.github && <a href={project.links.github} target="_blank" rel="noreferrer" className="text-white/60 hover:text-white flex items-center gap-1"><span className="underline underline-offset-4">GitHub</span> ↗</a>}
                                  {project.links?.devpost && <a href={project.links.devpost} target="_blank" rel="noreferrer" className="text-white/60 hover:text-white flex items-center gap-1"><span className="underline underline-offset-4">Devpost</span> ↗</a>}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-3xl border border-dashed border-white/20 bg-white/[0.02] backdrop-blur-sm">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/40 mb-4"><LayoutGrid className="w-8 h-8" /></div>
                    <h3 className="text-xl font-semibold mb-2">No proof-of-work added yet.</h3>
                    <p className="text-white/60 max-w-md mb-8 text-sm">
                      Projects help founders understand what you can actually build. Add a Devpost, GitHub repo, demo, app, or portfolio project to improve your match readiness.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <button onClick={() => { setAgentInput('I want to import a project from Devpost'); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5">
                        <span className="relative z-10 drop-shadow-sm">Import from Devpost</span>
                      </button>
                      <button onClick={() => { setAgentInput('I want to connect my GitHub account'); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5">
                        <span className="relative z-10 drop-shadow-sm">Connect GitHub</span>
                      </button>
                      <button onClick={() => { setAgentInput('I want to add a project manually'); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5">
                        <span className="relative z-10 drop-shadow-sm">Add manually</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {/* Event History Card */}
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                    <h3 className="text-xl font-semibold mb-4">Event History</h3>
                    {events.length > 0 ? (
                      <div className="space-y-4">
                        {events.map((event) => (
                          <div key={event._id} className="p-4 rounded-xl bg-gradient-to-br from-white/[0.06] to-transparent backdrop-blur-md border border-white/10">
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium text-white">{event.name || event.eventName || 'DevLabs Event'}</h4>
                              <span className="text-xs text-[#fa7d22] font-semibold tracking-wider">ATTENDED</span>
                            </div>
                            <p className="text-sm text-white/60 mt-1">{new Date(event.date || Date.now()).toLocaleDateString()}</p>
                            {event.badge && (
                              <div className="mt-3 flex items-center gap-2 text-xs">
                                <span className="w-5 h-5 rounded-full bg-[#fa7d22]/20 flex items-center justify-center text-[#fa7d22]"><Medal className="w-3 h-3" /></span>
                                <span className="text-white/80">{event.badge}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 rounded-xl border border-dashed border-white/10 text-center text-white/50 text-sm">
                        No events attended yet.
                      </div>
                    )}
                  </div>

                  {/* Momentum History Card */}
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                    <h3 className="text-xl font-semibold mb-4">Momentum</h3>
                    {momentum.length > 0 ? (
                      <div className="space-y-4">
                        {momentum.map((update) => (
                          <div key={update._id} className="p-4 rounded-xl bg-gradient-to-br from-white/[0.06] to-transparent backdrop-blur-md border border-white/10 border-l-2 border-l-[#fa7d22]">
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium text-white">{update.title || 'Weekly Update'}</h4>
                              <span className="text-[10px] uppercase text-white/50">{new Date(update.date || Date.now()).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-white/70 mt-2 line-clamp-2">{update.content || 'Shipped a new feature.'}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 rounded-xl border border-dashed border-white/10 text-center text-white/50 text-sm">
                        No Momentum updates yet.<br/>
                        <button onClick={() => { setAgentInput('I want to log a Momentum update'); setActiveTab('agent'); }} className="mt-3 text-[#fa7d22] hover:underline">Add progress update</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'matches' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-serif italic tracking-tight">Opportunity <span className="hero-underline">Matches</span></h2>
                  <div className="flex gap-2">
                    <button onClick={() => setActiveTab('profile')} className="px-3 py-1.5 rounded-lg bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors">Update Profile</button>
                  </div>
                </div>

                {matches.length ? (
                  <div className="grid grid-cols-1 gap-6">
                    {matches.map((match) => (
                      <div key={match._id} className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-6 flex flex-col hover:border-white/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-xl font-semibold">{match.roleTitle || 'Founder Opportunity'}</h3>
                            <p className="text-sm text-white/70 mt-1">{match.company || 'Confidential Startup'}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`px-3 py-1 text-xs rounded-full border font-medium ${match.matchLabel === 'strong' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30' : match.matchLabel === 'good' ? 'text-blue-300 bg-blue-500/15 border-blue-400/30' : match.matchLabel === 'possible' ? 'text-amber-200 bg-amber-500/15 border-amber-400/30' : 'text-white/80 bg-white/10 border-white/20'}`}>
                              {match.matchLabel ? match.matchLabel.replace('_', ' ') : 'Match'} · {match.matchScore}%
                            </span>
                            <span className="text-xs uppercase tracking-wider text-white/50">{match.status.replace('_', ' ')}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
                          <div>
                            <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Work Type</p>
                            <p className="text-white/90 capitalize">{match.workType?.join(', ') || 'Any'}</p>
                          </div>
                          <div>
                            <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Compensation</p>
                            <p className="text-white/90">{match.compensation || 'TBD'}</p>
                          </div>
                          <div>
                            <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Timeline</p>
                            <p className="text-white/90">{match.timeline || 'Immediate'}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.02] rounded-2xl p-5 border border-white/5 flex-1">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80 mb-3 flex items-center gap-2">
                              <Check className="w-4 h-4" /> Why you match
                            </p>
                            <p className="text-sm text-white/80 leading-relaxed">{match.reasoning || 'Your skills and background align with the founder\'s requirements.'}</p>
                          </div>
                          
                          {match.missingProof && match.missingProof.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/80 mb-3 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" /> Missing proof
                              </p>
                              <ul className="text-sm text-white/70 space-y-2 list-disc list-inside">
                                {match.missingProof.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-white/10">
                          {match.missingProof && match.missingProof.length > 0 && (
                            <button onClick={() => { setAgentInput(`Help me add proof for the ${match.company || 'startup'} match`); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center px-5 py-2.5 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5 text-sm">
                              <span className="relative z-10 drop-shadow-sm">Improve match</span>
                            </button>
                          )}
                          <button onClick={() => { setAgentInput(`I'm interested in the ${match.company || 'startup'} role`); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center px-6 py-2.5 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.04] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98] text-sm">
                            <span className="relative z-10">Express interest</span>
                            <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-3xl border border-dashed border-white/20 bg-white/[0.02] backdrop-blur-sm">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/40 mb-4"><Users className="w-8 h-8" /></div>
                    <h3 className="text-xl font-semibold mb-2">No matches yet.</h3>
                    <p className="text-white/60 max-w-md mb-8 text-sm">
                      {projects.length === 0 
                        ? "Add at least one proof-of-work project before we can match you with founders."
                        : matchScore >= 80 
                          ? "Your profile is match-ready. We’ll show founder opportunities here when they match your skills, availability, and work preferences."
                          : "Complete your profile to become eligible for matches."}
                    </p>
                    {projects.length === 0 ? (
                      <button onClick={() => setActiveTab('projects')} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.04] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Add proof-of-work</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                    ) : matchScore >= 80 ? (
                      <button onClick={() => { setAgentInput('Find matches for me'); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.04] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Ask Agent to find matches</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                    ) : (
                      <button onClick={() => setActiveTab('profile')} className="group relative inline-flex items-center justify-center px-6 py-3 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.04] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Keep profile updated</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'agent' && (
              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">DevLabs Agent</h3>
                    <p className="text-white/65 text-sm mt-1">Your AI operator to build proof-of-work and get hired.</p>
                    {refreshing ? <p className="text-xs text-[#fa7d22] mt-1 flex items-center gap-1"><span className="animate-pulse">●</span> Syncing profile…</p> : null}
                  </div>
                  <div className="flex gap-2 flex-wrap max-w-lg justify-end">
                    {(builder?.profileCompletion?.missingItems || []).slice(0, 3).map((item) => (
                      <button 
                        key={item} 
                        onClick={() => setAgentInput(`Help me add my ${item}`)} 
                        className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-[#fa7d22]/30 text-white/80 hover:bg-[#fa7d22]/10 hover:border-[#fa7d22]/50 transition-colors"
                      >
                        Add {item}
                      </button>
                    ))}
                    {!builder?.links?.github && (
                      <button onClick={() => setAgentInput('I want to connect my GitHub')} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/20 text-white/80 hover:bg-white/10 transition-colors">
                        Connect GitHub
                      </button>
                    )}
                    {projects.length === 0 && (
                      <button onClick={() => setAgentInput('I want to import a project from Devpost')} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/20 text-white/80 hover:bg-white/10 transition-colors">
                        Import Devpost
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-[400px] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b from-black/40 to-black/60 backdrop-blur-xl p-4 space-y-4 mb-4 shadow-inner">
                  {agentMessages.map((message, index) => (
                    <div key={`${message.sender}-${index}`} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${message.sender === 'agent' ? 'bg-white/10 text-white border border-white/5 shadow-sm' : 'bg-gradient-to-br from-[#fa7d22] to-[#ff9b4e] text-black font-medium shadow-[0_4px_15px_rgba(250,125,34,0.2)]'}`}>
                        {message.text}
                      </div>
                    </div>
                  ))}
                  
                  {agentMessages.length === 1 && !agentBusy && (
                    <div className="mt-8">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4 px-1">Suggested actions</p>
                      <div className="flex flex-wrap gap-3">
                        {builder.profileQuality?.suggestedFixes?.length > 0 ? (
                          builder.profileQuality.suggestedFixes.slice(0, 4).map((fix: any, i: number) => (
                            <button 
                              key={i} 
                              onClick={() => handleAgentSend(fix.action)} 
                              className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/80 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all shadow-sm flex items-center gap-2"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-[#fa7d22]/70" />
                              {fix.action}
                            </button>
                          ))
                        ) : (
                          <>
                            <button onClick={() => handleAgentSend('Add my GitHub')} className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/80 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all shadow-sm">Add my GitHub</button>
                            <button onClick={() => handleAgentSend('Import my Devpost project')} className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/80 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all shadow-sm">Import Devpost project</button>
                            <button onClick={() => handleAgentSend('Improve my founder-facing summary')} className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/80 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all shadow-sm">Improve founder summary</button>
                            <button onClick={() => handleAgentSend('Find matches for me')} className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/80 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all shadow-sm">Find matches</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {agentBusy ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl px-5 py-3 bg-white/5 border border-white/5 text-white/50 text-sm flex items-center gap-2">
                        <span className="animate-bounce">●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                      </div>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>

                {uiBlocks.length > 0 ? (
                  <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-1 shrink-0">
                    {uiBlocks.map((block, index) => {
                      if (block.type === 'issues_list' || block.type === 'suggested_fixes') {
                        return (
                          <div key={`${block.type}-${index}`} className="rounded-2xl border border-[#fa7d22]/20 bg-gradient-to-br from-white/[0.04] to-[#fa7d22]/5 p-4 shadow-sm md:col-span-2">
                            <p className="font-semibold text-sm text-white mb-2 flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-[#fa7d22]" /> {block.title}
                            </p>
                            <ul className="space-y-1.5 text-xs text-white/70">
                              {block.items?.map((item: string) => <li key={item} className="flex gap-2"><span className="text-white/30 text-lg leading-none mt-[-2px]">•</span> <span>{item}</span></li>)}
                            </ul>
                          </div>
                        );
                      }
                      return (
                        <div key={`${block.type}-${index}`} className="rounded-2xl border border-[#fa7d22]/20 bg-gradient-to-br from-white/[0.04] to-[#fa7d22]/5 p-4 shadow-sm">
                          <p className="font-semibold text-sm text-white mb-1 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#fa7d22]" /> {block.title || block.type}
                          </p>
                          {block.body ? <p className="text-white/75 text-xs leading-relaxed">{block.body}</p> : null}
                          {typeof block.score === 'number' ? <p className="text-xs text-white/60 mt-3 font-medium">Match Readiness: <span className={block.score >= 80 ? 'text-emerald-400' : 'text-amber-400'}>{block.score}%</span></p> : null}
                          {Array.isArray(block.items) && block.items.length ? (
                            <ul className="mt-3 space-y-1.5 text-xs text-white/70">
                              {block.items.map((item) => <li key={item} className="flex gap-2"><span className="text-white/30 text-lg leading-none mt-[-2px]">•</span> <span>{item}</span></li>)}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="flex gap-3 shrink-0">
                  <div className="relative flex-1">
                    <input
                      value={agentInput}
                      onChange={(event) => setAgentInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleAgentSend();
                        }
                      }}
                      placeholder='Tell the agent what to update (e.g. "I am open to full-time remote work")'
                      className="w-full rounded-xl bg-white/5 border border-white/20 pl-4 pr-12 py-3.5 text-white placeholder:text-white/45 focus:border-[#fa7d22]/50 focus:outline-none focus:bg-white/10 transition-all shadow-sm"
                    />
                    <button 
                      onClick={handleAgentSend} 
                      disabled={agentBusy || uploadingResume || !agentInput.trim()} 
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[#fa7d22]/20 text-[#fa7d22] hover:bg-[#fa7d22]/30 disabled:opacity-40 disabled:hover:bg-[#fa7d22]/20 transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                  <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleResumeUpload} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingResume || agentBusy} className="px-5 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/15 disabled:opacity-60 transition-colors font-medium flex items-center gap-2 whitespace-nowrap">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {uploadingResume ? 'Uploading…' : 'Upload resume'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-serif italic tracking-tight">Your <span className="hero-underline">Profile</span></h2>
                  <div className="group relative">
                    <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-white/70 cursor-help">
                      Visible to: <span className="text-white capitalize">{builder.visibilityStatus?.replace('_', ' ') || 'Matched founders only'}</span>
                    </span>
                    <div className="absolute right-0 top-full mt-2 w-64 p-3 rounded-xl bg-black/90 border border-white/10 text-xs text-white/80 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 shadow-xl">
                      Only founders with roles that match your profile can see your full profile.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Founder-Facing Preview */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white/80">Founder-Facing Preview</h3>
                    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="text-2xl font-semibold text-white">{builder.name}</h4>
                          <p className="text-[#fa7d22] font-medium mt-1">{builder.headline || builder.rolePreference?.[0] || 'Builder'}</p>
                        </div>
                        <div className="flex gap-2">
                          {builder.links?.linkedin && <a href={builder.links.linkedin} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">in</a>}
                          {builder.links?.github && <a href={builder.links.github} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">gh</a>}
                        </div>
                      </div>

                      <div className="space-y-6">
                        {builder.bio && (
                          <div>
                            <p className="text-xs uppercase tracking-wider text-white/40 mb-2">About</p>
                            <p className="text-sm text-white/80 leading-relaxed">{builder.bio}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-wider text-white/40 mb-1">Availability</p>
                            <p className="text-sm text-white/80">{builder.availability?.availableNow ? 'Available now' : 'Not currently looking'}</p>
                            <p className="text-sm text-white/60">{builder.availability?.hoursPerWeek || 0} hrs/week</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-white/40 mb-1">Location</p>
                            <p className="text-sm text-white/80 capitalize">Location preference: {builder.availability?.remotePreference?.replace('_', ' ') || 'Remote'}</p>
                            <p className="text-sm text-white/60 capitalize">Current location: {builder.location || 'Not added'}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Open To</p>
                          <div className="flex flex-wrap gap-2">
                            {builder.preferredWorkType?.map(type => <span key={type} className="px-2.5 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-white capitalize">{type.replace(/_/g, ' ')}</span>)}
                            {(!builder.preferredWorkType || builder.preferredWorkType.length === 0) && <span className="text-xs text-white/40">Not specified</span>}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Top Skills</p>
                          <div className="flex flex-wrap gap-2">
                            {topSkills.map(skill => <span key={skill} className="px-2.5 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-white">{skill}</span>)}
                            {!topSkills.length && <span className="text-xs text-white/40">No skills listed</span>}
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Featured Proof</p>
                          <div className="space-y-2">
                            {projects.slice(0, 2).map((project) => (
                              <div key={`preview-${project._id}`} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 flex justify-between items-center">
                                <div>
                                  <p className="font-medium text-sm text-white">{project.projectName}</p>
                                  <p className="text-xs text-white/50 mt-0.5 max-w-[200px] truncate">{project.description || 'Verified project'}</p>
                                </div>
                                <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-white/5 text-white/60">Verified</span>
                              </div>
                            ))}
                            {projects.length === 0 && <p className="text-xs text-white/40">No projects added yet</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Edit Profile Settings */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white/80">Edit Profile & Settings</h3>
                    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-6 space-y-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                      
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40">Availability & Work</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                            <span className="text-sm text-white/70">Hours per week</span>
                            <input value={settingsHours} onChange={(event) => setSettingsHours(event.target.value)} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors" />
                          </label>
                          <label className="block">
                            <span className="text-sm text-white/70">Remote preference</span>
                            <select value={settingsRemote} onChange={(event) => setSettingsRemote(event.target.value)} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors">
                              <option value="unspecified">Unspecified</option>
                              <option value="remote">Remote</option>
                              <option value="hybrid">Hybrid</option>
                              <option value="in_person">In person</option>
                            </select>
                          </label>
                        </div>

                        <label className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer text-sm text-white/80">
                          <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${settingsAvailable ? 'bg-[#fa7d22] text-black' : 'border border-white/20'}`}>
                            {settingsAvailable && <span>✓</span>}
                          </div>
                          <input type="checkbox" className="hidden" checked={settingsAvailable} onChange={(event) => setSettingsAvailable(event.target.checked)} />
                          I am currently open to opportunities
                        </label>

                        <div>
                          <p className="text-sm text-white/70 mb-2">Preferred work types</p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              ['full_time', 'Full-time'],
                              ['part_time_contract', 'Contract'],
                              ['internship', 'Internship'],
                              ['paid_sprint', 'Sprint'],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                onClick={() => toggleWorkType(value)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${settingsWorkTypes.includes(value) ? 'bg-[#fa7d22]/20 border border-[#fa7d22]/40 text-[#fa7d22]' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-white/10">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40">Profile Info</h4>
                        
                        <div className="space-y-4">
                          <label className="block">
                            <span className="text-sm text-white/70">Headline</span>
                            <input value={settingsHeadline} onChange={(event) => setSettingsHeadline(event.target.value)} placeholder="e.g. Full-stack builder" className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors text-white placeholder:text-white/30" />
                          </label>
                          <label className="block">
                            <span className="text-sm text-white/70">Bio</span>
                            <textarea value={settingsBio} onChange={(event) => setSettingsBio(event.target.value)} placeholder="A short summary about what you build..." rows={3} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors text-white placeholder:text-white/30 resize-none" />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-white/10">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40">Links</h4>
                        
                        <div className="space-y-4">
                          <label className="block">
                            <span className="text-sm text-white/70">GitHub</span>
                            <input value={settingsGithub} onChange={(event) => setSettingsGithub(event.target.value)} placeholder="https://github.com/..." className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors text-white placeholder:text-white/30" />
                          </label>
                          <label className="block">
                            <span className="text-sm text-white/70">LinkedIn</span>
                            <input value={settingsLinkedin} onChange={(event) => setSettingsLinkedin(event.target.value)} placeholder="https://linkedin.com/in/..." className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors text-white placeholder:text-white/30" />
                          </label>
                          <label className="block">
                            <span className="text-sm text-white/70">Portfolio</span>
                            <input value={settingsPortfolio} onChange={(event) => setSettingsPortfolio(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:border-[#fa7d22]/50 focus:outline-none transition-colors text-white placeholder:text-white/30" />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-white/10">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40">Agent Polish</h4>
                        <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-5 text-center">
                          <p className="text-sm text-white/70 mb-3">Want help writing your bio or extracting skills from your resume? The DevLabs Agent can automatically structure your data.</p>
                          <button onClick={() => { setAgentInput('I want to update my headline and bio'); setActiveTab('agent'); }} className="group relative inline-flex items-center justify-center px-5 py-2 rounded-full whitespace-nowrap bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all duration-400 shadow-[0_8px_32px_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-white/35 hover:shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:from-white/15 hover:via-white/10 hover:to-white/5 text-sm">
                            <span className="relative z-10 drop-shadow-sm">Improve with Agent</span>
                          </button>
                        </div>
                      </div>

                      <button onClick={saveSettings} className="group relative inline-flex items-center justify-center w-full py-3 mt-4 rounded-full overflow-hidden whitespace-nowrap bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.2),0_0_40px_rgba(250,125,34,0.15)] transition-all duration-400 ease-out hover:scale-[1.02] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_12px_48px_rgba(0,0,0,0.25),0_0_60px_rgba(250,125,34,0.25)] hover:-translate-y-0.5 active:scale-[0.98]">
                        <span className="relative z-10">Save Settings</span>
                        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#fa7d22]/0 via-[#fa7d22]/10 to-[#fa7d22]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-400" aria-hidden="true"></span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen bg-[#080909] text-white p-10">Checking session…</div>;
  if (!user) {
    if (typeof window !== 'undefined') window.location.href = '/login?redirect=/dashboard';
    return <div className="min-h-screen bg-[#080909] text-white p-10">Redirecting to login…</div>;
  }
  if (user.role === 'admin') return <AdminDashboard />;

  return <BuilderOSDashboard />;
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
