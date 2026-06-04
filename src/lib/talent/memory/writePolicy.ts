import type { MemoryEventType, MemorySource } from './memoryEvents';

type WriteDecision = {
  shouldWrite: boolean;
  reason?: string;
};

export function shouldWriteMemory(params: {
  content: string;
  type: MemoryEventType;
  source: MemorySource;
}): WriteDecision {
  if (!params.content || params.content.trim().length < 20) {
    return { shouldWrite: false, reason: 'content too short' };
  }

  const vague = [
    'founder likes strong candidates',
    'builder is good',
    'user updated profile',
    'action completed',
  ];
  const lower = params.content.toLowerCase();
  for (const phrase of vague) {
    if (lower.includes(phrase)) {
      return { shouldWrite: false, reason: 'content is too vague to be useful' };
    }
  }

  return { shouldWrite: true };
}

export function buildCandidateRejectionMemory(params: {
  founderName: string;
  builderName: string;
  opportunityId: string;
  builderId: string;
  roleTitle: string;
  reason: string;
}): string {
  return `Founder ${params.founderName} rejected candidate ${params.builderName} (builder ${params.builderId}) for role "${params.roleTitle}" (opportunity ${params.opportunityId}). Reason: ${params.reason}. Adjust future ranking for this opportunity to weight against this pattern.`;
}

export function buildCandidateSaveMemory(params: {
  founderName: string;
  builderName: string;
  opportunityId: string;
  builderId: string;
  roleTitle: string;
  reason: string;
}): string {
  return `Founder ${params.founderName} saved candidate ${params.builderName} (builder ${params.builderId}) for role "${params.roleTitle}" (opportunity ${params.opportunityId}). Reason: ${params.reason}. Use this as a positive signal for future search refinement.`;
}

export function buildIntroSentMemory(params: {
  founderName: string;
  builderName: string;
  roleTitle: string;
  opportunityId: string;
}): string {
  return `Founder ${params.founderName} sent intro to builder "${params.builderName}" for role "${params.roleTitle}" (opportunity ${params.opportunityId}).`;
}

export function buildRoleCreatedMemory(params: {
  founderName: string;
  roleTitle: string;
  company: string;
  hireType: string;
  skills: string[];
  opportunityId: string;
}): string {
  return `Founder ${params.founderName} created hiring request for role "${params.roleTitle}" at "${params.company}". Hire type: ${params.hireType}. Required skills: ${params.skills.join(', ')}. Opportunity: ${params.opportunityId}.`;
}

export function buildSearchRunMemory(params: {
  founderName: string;
  roleTitle: string;
  opportunityId: string;
  totalFound: number;
  strongCount: number;
  searchMode: string;
}): string {
  return `Founder ${params.founderName} ran search for role "${params.roleTitle}" (opportunity ${params.opportunityId}) in ${params.searchMode} mode. Found ${params.totalFound} candidates, ${params.strongCount} strong matches.`;
}

export function buildProjectImportMemory(params: {
  builderName: string;
  projectName: string;
  source: string;
  techStack: string[];
}): string {
  return `Builder ${params.builderName} imported project "${params.projectName}" from ${params.source}. Tech stack: ${params.techStack.join(', ')}.`;
}

export function buildAvailabilityUpdateMemory(params: {
  builderName: string;
  availableNow: boolean;
  hoursPerWeek: number | null;
  remotePreference: string;
}): string {
  return `Builder ${params.builderName} updated availability: available=${params.availableNow}, hours/week=${params.hoursPerWeek ?? 'unset'}, remote preference=${params.remotePreference}.`;
}
