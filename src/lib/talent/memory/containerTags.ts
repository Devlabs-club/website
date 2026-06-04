export const containers = {
  builder: (builderId: string) => `builder:${builderId}`,
  founder: (founderId: string) => `founder:${founderId}`,
  company: (companyId: string) => `company:${companyId}`,
  opportunity: (opportunityId: string) => `opportunity:${opportunityId}`,
  project: (projectId: string) => `project:${projectId}`,
  candidateFit: (opportunityId: string, builderId: string) => `candidate_fit:${opportunityId}:${builderId}`,
  intro: (introId: string) => `intro:${introId}`,
  trial: (trialId: string) => `trial:${trialId}`,
  thread: (threadId: string) => `thread:${threadId}`,
} as const;

export type ContainerScope =
  | 'builder'
  | 'founder'
  | 'company'
  | 'opportunity'
  | 'project'
  | 'candidate_fit'
  | 'intro'
  | 'trial'
  | 'thread';
