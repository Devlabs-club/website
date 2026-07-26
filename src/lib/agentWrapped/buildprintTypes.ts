export type BuildprintConfidence = 'low' | 'moderate' | 'high';

export type EvidenceStrength = 'emerging' | 'established' | 'verified' | 'exceptional';

export type ProofMetric = {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  sourceSignalIds?: string[];
};

export type EarnedIdentity = {
  id: string;
  label: string;
  score: number;
  confidence: BuildprintConfidence;
  qualified: boolean;
  qualificationVersion: string;
  proofStatement: string;
  proofMetrics: ProofMetric[];
  signalBreakdown: Array<{
    signalId: string;
    label: string;
    score: number;
    weight: number;
    explanation: string;
  }>;
  missingRequirements?: string[];
  cardLine: string;
};

export type BuildprintNextUnlock = {
  identityId: string;
  label: string;
  missingRequirements: string[];
  explanation: string;
};

export type BuilderBuildprint = {
  schemaVersion: string;
  generatedAt: string;
  methodologyVersion: string;
  evidenceStrength: EvidenceStrength;
  confidence: BuildprintConfidence;
  primaryIdentityId?: string;
  selectedPublicIdentityId?: string;
  earnedIdentities: EarnedIdentity[];
  proofStats: ProofMetric[];
  stackFingerprint: string[];
  publicCardLine?: string;
  nextUnlock?: BuildprintNextUnlock;
  comparisonBasis?: string;
  forming?: {
    message: string;
    sessionsNeeded: number;
    topSignals: Array<{ id: string; label: string; score: number }>;
  };
};

export const BUILDPRINT_SCHEMA_VERSION = '1';
export const BUILDPRINT_METHODOLOGY_VERSION = 'buildprint-0.3.0';
export const BUILDPRINT_QUALIFICATION_VERSION = 'buildprint-identities-0.3.0';

export type BuildprintAcquisitionSource = {
  sourceBuilderId?: string;
  referringBuildprintId?: string;
  card?: string;
  channel?: string;
  ctaPlacement?: string;
  campaign?: string;
  methodologyVersion?: string;
  capturedAt?: string;
};
