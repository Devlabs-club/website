import { ADMIN_SCOUT_SESSION_STORAGE_KEY } from '@/lib/talent/adminScoutSession';

export function getOrCreateScoutSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ADMIN_SCOUT_SESSION_STORAGE_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(ADMIN_SCOUT_SESSION_STORAGE_KEY, id);
  }
  return id;
}

export function resetScoutSessionId(): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_SCOUT_SESSION_STORAGE_KEY, id);
  }
  return id;
}

export type ScoutSearchSummary = {
  id: string;
  roleTitle: string;
  company: string;
  status: string;
  skillsNeeded: string[];
  builderWillDo: string | null;
  updatedAt: string;
  createdAt: string;
  hasShortlist: boolean;
  totalMatches: number;
  strongMatchCount: number;
  searchRunAt: string | null;
};

export type AdminCandidate = {
  builderId: string;
  name: string;
  email: string | null;
  universityOrCompany: string | null;
  matchScore: number;
  matchLabel: string;
  topSkills: string[];
  proofStrengthLabel: string;
  whyTheyMatch: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  availability: {
    availableNow: boolean;
    hoursPerWeek: number | null;
    remotePreference: string | null;
    desiredCompensation: string | null;
  };
  riskFlags: string[];
  projects: Array<{
    _id: string;
    projectName: string;
    description: string | null;
    builderContribution: string | null;
    techStack: string[];
    verificationLabel: string;
    links: { github: string | null; devpost: string | null; demo: string | null };
  }>;
  links: {
    github: string | null;
    linkedin: string | null;
    portfolio: string | null;
    devpost: string | null;
    resume: string | null;
  };
  signalScores: Record<string, unknown> | null;
  builderVerificationLabel: string;
};

async function scoutApi<T>(action: string, scoutSessionId: string, payload: Record<string, unknown> = {}) {
  const res = await fetch('/api/agent/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload: { scoutSessionId, ...payload } }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data as T;
}

export async function fetchScoutSearches(scoutSessionId: string): Promise<ScoutSearchSummary[]> {
  const data = await scoutApi<{ searches: ScoutSearchSummary[] }>(
    'admin_scout_list_searches',
    scoutSessionId
  );
  return data.searches || [];
}

export async function deleteScoutSearch(scoutSessionId: string, opportunityId: string) {
  return scoutApi('admin_scout_delete_search', scoutSessionId, { opportunityId });
}

export async function loadScoutShortlist(scoutSessionId: string, opportunityId: string) {
  return scoutApi<{
    opportunity: Record<string, unknown>;
    shortlist: { candidates: AdminCandidate[]; totalMatches: number; strongMatchCount: number };
  }>('admin_scout_load_shortlist', scoutSessionId, { opportunityId });
}

export function isStartFreshIntent(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 200) return false;
  return (
    /\b(start fresh|start over|new search|begin fresh|from scratch|brand new)\b/i.test(trimmed) ||
    /^(start fresh|new search|new role)$/i.test(trimmed)
  );
}

export function formatScoutSearchDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

export type AgentOption = { label: string; value: string };

export function parseAgentOptions(
  text: string
): { message: string; question: string; options: AgentOption[] } | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const optionLines: { idx: number; label: string }[] = [];

  lines.forEach((line, i) => {
    const m = line.match(/^(\d+)\.\s+(.+)$/);
    if (m) optionLines.push({ idx: i, label: m[2] });
  });

  if (optionLines.length < 2) return null;

  const firstOptionIdx = optionLines[0].idx;
  const lastOptionIdx = optionLines[optionLines.length - 1].idx;
  const questionIdx = firstOptionIdx - 1;
  const question = questionIdx >= 0 ? lines[questionIdx] : '';
  const messageParts = [
    ...lines.slice(0, Math.max(0, questionIdx)),
    ...lines.slice(lastOptionIdx + 1),
  ]
    .join('\n')
    .trim();

  return {
    message: messageParts,
    question,
    options: optionLines.map((o) => ({ label: o.label, value: o.label })),
  };
}

export type SearchQualityBlock = {
  totalScanned: number;
  totalRetrieved: number;
  strongCount: number;
  mediumCount: number;
  poolStrength: 'weak' | 'medium' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  bottlenecks: string[];
  suggestedRelaxations: string[];
  summary?: string;
};
