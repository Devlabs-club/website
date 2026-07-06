export type EnrichmentSource = 'resume' | 'devpost' | 'github' | 'linkedin' | 'portfolio' | 'twitter';

export type EnrichedProjectDraft = {
  projectName: string;
  description?: string | null;
  problemSolved?: string | null;
  techStack?: string[];
  builderContribution?: string | null;
  links?: {
    github?: string | null;
    devpost?: string | null;
    demo?: string | null;
    videoDemo?: string | null;
    pitchDeck?: string | null;
    screenshots?: string | null;
  };
  status?: 'prototype' | 'launched' | 'abandoned' | 'active' | 'incorporated' | 'unknown';
  source: string;
  sourceId: string;
  verificationStatus?: 'imported_unverified' | 'builder_confirmed';
  confidence?: number;
};

export type EnrichedProfileDraft = {
  headline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  rolePreference?: string[];
  skills?: string[];
  universityOrCompany?: string | null;
  graduationYear?: number | null;
  experiences?: Array<{
    title?: string | null;
    company?: string | null;
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
    source?: string | null;
    sourceId?: string | null;
  }>;
  education?: Array<{
    school?: string | null;
    degree?: string | null;
    field?: string | null;
    source?: string | null;
  }>;
  links?: {
    github?: string | null;
    linkedin?: string | null;
    portfolio?: string | null;
    personalWebsite?: string | null;
    devpost?: string | null;
    twitter?: string | null;
  };
};

export type SourceEnrichmentResult = {
  source: EnrichmentSource;
  profile?: EnrichedProfileDraft;
  projects?: EnrichedProjectDraft[];
  errors?: string[];
  meta?: Record<string, unknown>;
};

export type BuilderEnrichmentResult = {
  builderId: string;
  sources: SourceEnrichmentResult[];
  projectsCreated: number;
  projectsUpdated: number;
  profileFieldsUpdated: string[];
};
