export type AgentWrappedConfidence = 'low' | 'moderate' | 'high';

export type AgentWrappedReport = {
  builderId: string;
  reportId: string;
  builderName?: string;
  builderHandle?: string;
  archetype: string;
  score: number;
  percentile?: number;
  confidence: AgentWrappedConfidence;
  source: 'uploaded_agent_usage' | 'profile_fallback';
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
