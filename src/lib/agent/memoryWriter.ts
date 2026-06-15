import { containers } from '@/lib/talent/memory/containerTags';
import { makeMemoryEvent, type MemoryEventType, type MemorySource } from '@/lib/talent/memory/memoryEvents';
import { shouldWriteMemory } from '@/lib/talent/memory/writePolicy';

type AddMemoryFn = (containerTag: string, content: string) => Promise<void>;

async function writeTypedMemory(
  addFn: AddMemoryFn,
  params: {
    content: string;
    containerTag: string;
    type: MemoryEventType;
    actorType: 'builder' | 'founder' | 'agent' | 'admin';
    actorId: string;
    source?: MemorySource;
    confidence?: 'low' | 'medium' | 'high';
  }
): Promise<void> {
  const decision = shouldWriteMemory({ content: params.content, type: params.type, source: params.source ?? 'agent_inference' });
  if (!decision.shouldWrite) return;

  const event = makeMemoryEvent(params);
  await addFn(event.containerTag, event.content);
}

export async function writeBuilderAvailabilityMemory(
  addFn: AddMemoryFn,
  params: { builderId: string; builderName: string; availableNow: boolean; hoursPerWeek: number | null; remotePreference: string }
): Promise<void> {
  const content = `Builder ${params.builderName} updated availability: available=${params.availableNow}, hours/week=${params.hoursPerWeek ?? 'unset'}, remote preference=${params.remotePreference}.`;
  void writeTypedMemory(addFn, {
    content,
    containerTag: containers.builder(params.builderId),
    type: 'builder_profile_fact',
    actorType: 'builder',
    actorId: params.builderId,
    source: 'profile_update',
    confidence: 'high',
  });
}

export async function writeBuilderLinksMemory(
  addFn: AddMemoryFn,
  params: { builderId: string; builderName: string; github?: string | null; linkedin?: string | null; portfolio?: string | null }
): Promise<void> {
  const changed = [
    params.github ? `github=${params.github}` : null,
    params.linkedin ? `linkedin=${params.linkedin}` : null,
    params.portfolio ? `portfolio=${params.portfolio}` : null,
  ].filter(Boolean);
  if (!changed.length) return;
  const content = `Builder ${params.builderName} updated profile links: ${changed.join(', ')}.`;
  void writeTypedMemory(addFn, {
    content,
    containerTag: containers.builder(params.builderId),
    type: 'builder_profile_fact',
    actorType: 'builder',
    actorId: params.builderId,
    source: 'profile_update',
    confidence: 'high',
  });
}

export async function writeBuilderProjectImportMemory(
  addFn: AddMemoryFn,
  params: { builderId: string; builderName: string; projectId: string; projectName: string; source: string; techStack: string[] }
): Promise<void> {
  const content = `Builder ${params.builderName} imported project "${params.projectName}" from ${params.source}. Tech stack: ${params.techStack.join(', ') || 'unspecified'}.`;
  await Promise.all([
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.builder(params.builderId),
      type: 'project_proof',
      actorType: 'builder',
      actorId: params.builderId,
      source: params.source.startsWith('github') ? 'github_import' : 'devpost_import',
      confidence: 'medium',
    }),
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.project(params.projectId),
      type: 'project_proof',
      actorType: 'builder',
      actorId: params.builderId,
      source: params.source.startsWith('github') ? 'github_import' : 'devpost_import',
      confidence: 'medium',
    }),
  ]);
}

export async function writeBuilderHeadlineBioMemory(
  addFn: AddMemoryFn,
  params: { builderId: string; builderName: string; headline?: string | null; bio?: string | null }
): Promise<void> {
  const parts: string[] = [];
  if (params.headline) parts.push(`headline="${params.headline}"`);
  if (params.bio) parts.push(`bio updated (${params.bio.slice(0, 60)}...)`);
  if (!parts.length) return;
  const content = `Builder ${params.builderName} updated profile basics: ${parts.join(', ')}.`;
  void writeTypedMemory(addFn, {
    content,
    containerTag: containers.builder(params.builderId),
    type: 'builder_profile_fact',
    actorType: 'builder',
    actorId: params.builderId,
    source: 'profile_update',
    confidence: 'high',
  });
}

export async function writeFounderEnrichmentMemory(
  addFn: AddMemoryFn,
  params: {
    founderId: string;
    founderName: string;
    company: string;
    startupSummary?: string | null;
    industry?: string | null;
    fundingStage?: string | null;
    productDescription?: string | null;
    techStackHints?: string[];
    founderBio?: string | null;
    sources?: string[];
  }
): Promise<void> {
  const parts = [
    `Founder ${params.founderName} onboarded for company "${params.company}".`,
    params.startupSummary ? `Summary: ${params.startupSummary}` : null,
    params.industry ? `Industry: ${params.industry}` : null,
    params.fundingStage ? `Stage: ${params.fundingStage}` : null,
    params.productDescription ? `Product: ${params.productDescription}` : null,
    params.techStackHints?.length ? `Stack hints: ${params.techStackHints.join(', ')}` : null,
    params.founderBio ? `Founder bio: ${params.founderBio}` : null,
    params.sources?.length ? `Sources: ${params.sources.join(', ')}` : null,
  ].filter(Boolean);

  void writeTypedMemory(addFn, {
    content: parts.join(' '),
    containerTag: containers.founder(params.founderId),
    type: 'founder_preference',
    actorType: 'agent',
    actorId: params.founderId,
    source: 'profile_update',
    confidence: 'medium',
  });
}

export async function writeFounderRoleCreatedMemory(
  addFn: AddMemoryFn,
  params: {
    founderId: string;
    founderName: string;
    opportunityId: string;
    roleTitle: string;
    company: string;
    hireType: string;
    skills: string[];
  }
): Promise<void> {
  const content = `Founder ${params.founderName} created hiring request for role "${params.roleTitle}" at "${params.company}". Hire type: ${params.hireType}. Required skills: ${params.skills.join(', ') || 'unspecified'}.`;
  await Promise.all([
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.founder(params.founderId),
      type: 'founder_preference',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'user_message',
      confidence: 'high',
    }),
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.opportunity(params.opportunityId),
      type: 'opportunity_constraint',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'user_message',
      confidence: 'high',
    }),
  ]);
}

export async function writeFounderRoleUpdatedMemory(
  addFn: AddMemoryFn,
  params: {
    founderId: string;
    founderName: string;
    opportunityId: string;
    roleTitle: string;
    changedFields: string[];
  }
): Promise<void> {
  const content = `Founder ${params.founderName} updated role "${params.roleTitle}" (opportunity ${params.opportunityId}): changed fields — ${params.changedFields.join(', ')}.`;
  void writeTypedMemory(addFn, {
    content,
    containerTag: containers.opportunity(params.opportunityId),
    type: 'opportunity_constraint',
    actorType: 'founder',
    actorId: params.founderId,
    source: 'user_message',
    confidence: 'high',
  });
}

export async function writeFounderSearchRunMemory(
  addFn: AddMemoryFn,
  params: {
    founderId: string;
    founderName: string;
    opportunityId: string;
    roleTitle: string;
    totalFound: number;
    strongCount: number;
    searchMode: string;
  }
): Promise<void> {
  const content = `Founder ${params.founderName} ran search for role "${params.roleTitle}" (opportunity ${params.opportunityId}) in ${params.searchMode} mode. Found ${params.totalFound} candidates, ${params.strongCount} strong matches.`;
  void writeTypedMemory(addFn, {
    content,
    containerTag: containers.opportunity(params.opportunityId),
    type: 'search_strategy',
    actorType: 'agent',
    actorId: params.founderId,
    source: 'search_action',
    confidence: 'high',
  });
}

export async function writeFounderIntroSentMemory(
  addFn: AddMemoryFn,
  params: {
    founderId: string;
    founderName: string;
    builderId: string;
    builderName: string;
    opportunityId: string;
    roleTitle: string;
  }
): Promise<void> {
  const content = `Founder ${params.founderName} sent intro to builder "${params.builderName}" (${params.builderId}) for role "${params.roleTitle}" (opportunity ${params.opportunityId}).`;
  await Promise.all([
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.opportunity(params.opportunityId),
      type: 'intro_outcome',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'intro_request',
      confidence: 'high',
    }),
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.candidateFit(params.opportunityId, params.builderId),
      type: 'intro_outcome',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'intro_request',
      confidence: 'high',
    }),
  ]);
}

export async function writeFounderCandidateRejectionMemory(
  addFn: AddMemoryFn,
  params: {
    founderId: string;
    founderName: string;
    builderId: string;
    builderName: string;
    opportunityId: string;
    roleTitle: string;
    reason: string;
    reasonCategory: string;
  }
): Promise<void> {
  const content = `Founder ${params.founderName} rejected candidate "${params.builderName}" (builder ${params.builderId}) for role "${params.roleTitle}" (opportunity ${params.opportunityId}). Rejection reason: ${params.reason} (category: ${params.reasonCategory}). Adjust future ranking for this opportunity to penalize this pattern.`;
  await Promise.all([
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.opportunity(params.opportunityId),
      type: 'negative_preference',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'candidate_rejection',
      confidence: 'high',
    }),
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.candidateFit(params.opportunityId, params.builderId),
      type: 'candidate_feedback',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'candidate_rejection',
      confidence: 'high',
    }),
  ]);
}

export async function writeFounderCandidateSaveMemory(
  addFn: AddMemoryFn,
  params: {
    founderId: string;
    founderName: string;
    builderId: string;
    builderName: string;
    opportunityId: string;
    roleTitle: string;
    reason: string;
    reasonCategory: string;
  }
): Promise<void> {
  const content = `Founder ${params.founderName} saved candidate "${params.builderName}" (builder ${params.builderId}) for role "${params.roleTitle}" (opportunity ${params.opportunityId}). Save reason: ${params.reason} (category: ${params.reasonCategory}). Use as positive signal for future search refinement.`;
  await Promise.all([
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.opportunity(params.opportunityId),
      type: 'positive_preference',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'candidate_save',
      confidence: 'high',
    }),
    writeTypedMemory(addFn, {
      content,
      containerTag: containers.candidateFit(params.opportunityId, params.builderId),
      type: 'candidate_feedback',
      actorType: 'founder',
      actorId: params.founderId,
      source: 'candidate_save',
      confidence: 'high',
    }),
  ]);
}
