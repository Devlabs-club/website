import type { NotificationItem } from '@/components/founder/founderTypes';

export type TabKey = 'home' | 'intros' | 'messages' | 'calls' | 'trials' | 'profile';

export type BuilderData = {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  rolePreference?: string[];
  preferredWorkType?: string[];
  experiences?: Array<{
    title?: string;
    company?: string;
    companyLogoUrl?: string | null;
    companyLinkedInUrl?: string | null;
    employmentType?: string | null;
    location?: string | null;
    dateRange?: string | null;
    startDateLabel?: string | null;
    endDateLabel?: string | null;
    duration?: string | null;
    description?: string | null;
    skills?: string[];
    isCurrent?: boolean;
    source?: string;
    sourceId?: string;
  }>;
  links?: {
    github?: string | null;
    linkedin?: string | null;
    portfolio?: string | null;
    personalWebsite?: string | null;
    devpost?: string | null;
    resume?: string | null;
    twitter?: string | null;
  };
  availability?: {
    availableNow?: boolean;
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
  refreshing: boolean;
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
  topRoles: string[];
  topSkills: string[];
  setActiveTab: (tab: TabKey) => void;
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
  saveSettings: () => void;
  loadDashboard: (opts?: { silent?: boolean }) => Promise<void>;
  logout: () => void;
  tabBadge: (key?: string) => number;
};
