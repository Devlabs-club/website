import type { NotificationItem } from '@/components/founder/founderTypes';

export type TabKey = 'home' | 'projects' | 'matches' | 'messages' | 'calls' | 'trials' | 'agent' | 'profile' | 'events';

export type BuilderData = {
  _id: string;
  name: string;
  email: string;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  rolePreference?: string[];
  preferredWorkType?: string[];
  links?: {
    github?: string | null;
    linkedin?: string | null;
    portfolio?: string | null;
    devpost?: string | null;
    resume?: string | null;
  };
  availability?: {
    availableNow?: boolean;
    hoursPerWeek?: number | null;
    remotePreference?: string | null;
    salaryExpectationMin?: number | null;
    salaryExpectationMax?: number | null;
    earliestStartDate?: string | null;
  };
  profileCompletion?: {
    score?: number;
    profileScore?: number;
    proofScore?: number;
    matchScore?: number;
    missingItems?: string[];
    eligibility?: string;
    profileCompletionLabel?: string;
    proofStrengthLabel?: string;
  };
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

export type ProjectData = {
  _id: string;
  projectName: string;
  description?: string;
  techStack?: string[];
  links?: { github?: string; demo?: string; devpost?: string; screenshots?: string };
  source?: string;
  verificationStatus?: string;
  builderContribution?: string;
};

export type ProjectStats = {
  total: number;
  devpostImports: number;
  githubProjects: number;
  verifiedContributions: number;
};

export type MatchData = {
  _id: string;
  matchScore: number;
  status: string;
  reasoning?: string;
  opportunityId?: string;
  roleTitle?: string;
  company?: string;
  matchLabel?: 'strong' | 'good' | 'possible' | 'needs_more_proof';
  missingProof?: string[];
  workType?: string | string[];
  compensation?: string;
  timeline?: string;
};

export type AgentMessage = { sender: 'agent' | 'user'; text: string };

export type UiBlock = {
  type: string;
  title?: string;
  body?: string;
  items?: string[];
  missingItems?: string[];
  score?: number;
  eligibility?: string;
};

export type BuilderDashboardContext = {
  user: { id?: string; email?: string } | null;
  builder: BuilderData;
  projects: ProjectData[];
  matches: MatchData[];
  introInbox: any[];
  activeTrials: any[];
  upcomingCalls: any[];
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  projectStats: ProjectStats;
  agentMessages: AgentMessage[];
  agentInput: string;
  agentBusy: boolean;
  refreshing: boolean;
  uiBlocks: UiBlock[];
  uploadingResume: boolean;
  messagesThreadId: string | null;
  messagesIntroId: string | null;
  settingsHours: string;
  settingsRemote: string;
  settingsAvailable: boolean;
  settingsWorkTypes: string[];
  settingsHeadline: string;
  settingsBio: string;
  settingsGithub: string;
  settingsLinkedin: string;
  settingsPortfolio: string;
  profileScore: number;
  proofScore: number;
  matchScore: number;
  qualityScore: number;
  qualityLabel: string;
  unreadCount: number;
  topRoles: string[];
  topSkills: string[];
  setActiveTab: (tab: TabKey) => void;
  setAgentInput: (v: string) => void;
  setMessagesThreadId: (v: string | null) => void;
  setMessagesIntroId: (v: string | null) => void;
  setSettingsHours: (v: string) => void;
  setSettingsRemote: (v: string) => void;
  setSettingsAvailable: (v: boolean) => void;
  setSettingsHeadline: (v: string) => void;
  setSettingsBio: (v: string) => void;
  setSettingsGithub: (v: string) => void;
  setSettingsLinkedin: (v: string) => void;
  setSettingsPortfolio: (v: string) => void;
  toggleWorkType: (value: string) => void;
  handleAgentSend: (overrideText?: string) => void;
  handleResumeUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  saveSettings: () => void;
  loadDashboard: (opts?: { silent?: boolean }) => Promise<void>;
  logout: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  tabBadge: (key?: string) => number;
};
