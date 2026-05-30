export type TrialProjectDraft = {
  title: string;
  goal: string;
  deliverables: string[];
  timeline: string;
  deadlineAt?: string | null;
  successCriteria: string[];
  updatedAt?: string | null;
  status?: 'draft' | 'sent' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
  sentAt?: string | null;
  submittedAt?: string | null;
  submission?: {
    videoUrl?: string | null;
    githubUrl?: string | null;
    notes?: string | null;
    submittedAt?: string | null;
  } | null;
  rejectionNotes?: Array<{ note: string; rejectedAt?: string | null }>;
  rejectionCount?: number;
};

export type CallScheduleData = {
  _id: string;
  opportunityId: string;
  builderId: string;
  status: string;
  proposedBy: string;
  proposedSlot?: { startAt: string; endAt: string; timezone: string } | null;
  confirmedSlot?: { startAt: string; endAt: string; timezone: string } | null;
  meetingUrl?: string | null;
  notes?: string | null;
  rescheduleCount?: number;
  callCompletedAt?: string | null;
};

export type NotificationItem = {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  readAt?: string | null;
  createdAt: string;
  entityType?: string | null;
  entityId?: string | null;
};

export type AnonymousCandidate = {
  anonymousLabel: string;
  matchScore: number;
  matchLabel: string;
  roleType?: string;
  topSkills?: string[];
  proofSummary?: string;
  availabilitySummary?: string;
  whyTheyMatch?: string;
};

export type FullCandidate = {
  builderId: string;
  matchRecordId: string | null;
  anonymousLabel: string | null;
  matchScore: number;
  matchLabel: string;
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  availability: {
    availableNow: boolean;
    hoursPerWeek: number | null;
    remotePreference: string | null;
    desiredCompensation: string | null;
  };
  workTypes: string[];
  topSkills: string[];
  founderClarityLabel: string | null;
  proofStrengthLabel: string;
  builderVerificationLabel: string;
  whyTheyMatch: string | null;
  riskFlags: string[];
  recommendedNextStep: string;
  projects: Array<{
    _id: string;
    projectName: string;
    description: string | null;
    problemSolved: string | null;
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
  matchStatus: string;
  saved: boolean;
  introRequested: boolean;
  hidden: boolean;
  suggestedInterviewQuestions: string[];
  suggestedTrialProject: string;
  trialProject: TrialProjectDraft | null;
  callCompletedAt?: string | null;
  introRequestStatus?: string | null;
};

export type PipelineEntry = {
  matchRecordId: string;
  builderId: string;
  opportunityId: string;
  candidateName: string;
  roleTitle?: string;
  company?: string;
  matchScore: number;
  matchLabel?: string;
  status: string;
  statusLabel: string;
  matchStatus: string;
  nextStep: string;
  introRequestId: string | null;
  introRequestStatus: string | null;
  introMessage: string | null;
  introRequestedAt?: string | null;
  updatedAt?: string;
  trialProjectStatus?: string | null;
  callCompletedAt?: string | null;
  callScheduleStatus?: string | null;
  callScheduleId?: string | null;
  confirmedCallStartAt?: string | null;
  confirmedCallEndAt?: string | null;
};

export type FounderPipeline = {
  entries: PipelineEntry[];
  grouped: Record<string, PipelineEntry[]>;
};

export type PublicShortlist = {
  _id: string;
  opportunityId: string;
  unlocked: boolean;
  unlockedAt?: string | null;
  totalMatches: number;
  strongMatchCount: number;
  previewGeneratedAt?: string;
  candidates: AnonymousCandidate[];
  fullCandidates?: FullCandidate[] | null;
};

export type Opportunity = {
  _id: string;
  company?: string;
  startupSummary?: string;
  industry?: string;
  builderWillDo?: string;
  roleTitle?: string;
  roleType?: string[];
  skillsNeeded?: string[];
  workType?: string;
  timeline?: string;
  budget?: string;
  locationPreference?: string;
  availabilityNeeded?: string;
  successIn30Days?: string;
  niceToHaveSkills?: string[];
  seniority?: string;
  hoursPerWeek?: string;
  deliverables?: string[];
  fundingStage?: string;
  skippedFields?: string[];
  status?: string;
  updatedAt?: string;
};

