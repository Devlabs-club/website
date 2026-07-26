import type { BuilderBuildprint } from './buildprintTypes';

export type AgentWrappedConfidence = 'low' | 'moderate' | 'high';

/** Aggregated local telemetry (counts/histograms only — no prompts or paths). */
export type AgentWrappedUsage = {
  schemaVersion: number;
  windowDays: number;
  activeHours: {
    last30: number;
    allTime: number;
    estimated: boolean;
    method?: string;
    gapMinutes?: number;
    cursorSqlite?: boolean;
  };
  sessions: {
    last30: number;
    allTime: number;
  };
  tokens: {
    total: number;
    work: number;
    cache: number;
    byAgent: Array<{ agent: string; total: number; hours?: number; sessions?: number }>;
    cursorEstimated: boolean;
    retailCostUsd?: number;
  };
  models: Array<{ id: string; percent: number; sessions: number }>;
  rhythm: {
    hourBuckets: number[];
    peakHour: number;
    weekdayPct: number;
    weekendPct: number;
  };
  months?: Array<{ ym: string; hours: number; sessions: number }>;
  coverageHash?: string;
};

export type AgentWrappedReport = {
  builderId: string;
  reportId: string;
  builderName?: string;
  builderHandle?: string;
  archetype: string;
  /** @deprecated Legacy Founder Fit — do not show publicly. Prefer buildprint.evidenceStrength. */
  score: number;
  /** @deprecated Fake local percentile — omit for Buildprint reports. */
  percentile?: number;
  confidence: AgentWrappedConfidence;
  source: 'uploaded_agent_usage';
  sourceSummary: {
    claudeSessions?: number;
    codexSessions?: number;
    cursorSessions?: number;
    manualImports?: number;
    projectsReferenced?: number;
    daysCovered?: number;
  };
  sourceCoverage?: {
    agents: string[];
    sessionCount: number;
    timeframeLabel: string;
    confidenceNotes: string[];
  };
  /** Structured usage telemetry (localAnalysisVersion 0.4.0+). */
  usage?: AgentWrappedUsage;
  languages: {
    name: string;
    percent: number;
    sessions?: number;
    evidence?: 'session_summary' | 'agent_export' | 'config' | 'profile' | 'project_fallback';
  }[];
  frameworks: {
    name: string;
    confidence?: AgentWrappedConfidence;
    evidence?: string[];
  }[];
  buildSurface: {
    frontend: number;
    backend: number;
    database: number;
    infra: number;
    tests: number;
    docs?: number;
  };
  validation: {
    buildTestLoops: number;
    errorRecoveryLoops: number;
    successfulReruns: number;
    testDisciplineScore: number;
  };
  agentMaturity: {
    planningScore: number;
    contextScore: number;
    iterationScore: number;
    verificationScore: number;
    blindAcceptanceRisk: 'low' | 'moderate' | 'high';
  };
  founderRead: {
    bestFitRoles: string[];
    summary: string;
    strengths: string[];
    weaknesses: string[];
    riskFlags: string[];
  };
  evidenceHighlights: string[];
  share: {
    publicUrl: string;
    imageUrl?: string;
  };
  createdAt: string;
  timeInvested?: {
    totalHours: number;
    longestSessionMinutes: number;
    estimated?: boolean;
    sessionFiles?: number;
    timedSessionFiles?: number;
    daysCovered?: number;
    method?: string;
    last30Hours?: number;
  };
  agentSplit?: {
    agent: string;
    percent: number;
    sessions?: number;
  }[];
  identities?: {
    name: string;
    tagline: string;
    score: number;
  }[];
  /** Buildprint artifact (methodology buildprint-0.3.0+). Absent on legacy Wrapped reports. */
  buildprint?: BuilderBuildprint;
  localAnalysisVersion?: string;
};

export type UploadAgentWrappedReportRequest = {
  builderId: string;
  report: AgentWrappedReport;
  localAnalysisVersion: string;
  consent: {
    approvedAt: string;
    rawContentUploaded: false;
  };
};

export type AgentWrappedUploadTokenPayload = {
  kind: 'agent_wrapped_upload';
  builderId: string;
  email: string;
};

export function isUploadedAgentWrappedReport(report: AgentWrappedReport | null | undefined): boolean {
  return report?.source === 'uploaded_agent_usage';
}
