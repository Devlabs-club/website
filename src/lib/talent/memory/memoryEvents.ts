export type MemoryEventType =
  | 'builder_profile_fact'
  | 'builder_profile_gap'
  | 'project_proof'
  | 'project_contribution'
  | 'founder_preference'
  | 'company_hiring_pattern'
  | 'opportunity_constraint'
  | 'candidate_feedback'
  | 'search_strategy'
  | 'intro_outcome'
  | 'trial_outcome'
  | 'agent_action'
  | 'negative_preference'
  | 'positive_preference';

export type MemoryActorType = 'builder' | 'founder' | 'agent' | 'admin';

export type MemoryEntityType =
  | 'builder'
  | 'founder'
  | 'company'
  | 'opportunity'
  | 'project'
  | 'candidate'
  | 'intro'
  | 'trial';

export type MemoryConfidence = 'low' | 'medium' | 'high';

export type MemorySource =
  | 'user_message'
  | 'profile_update'
  | 'github_import'
  | 'devpost_import'
  | 'portfolio_import'
  | 'search_action'
  | 'candidate_rejection'
  | 'candidate_save'
  | 'intro_request'
  | 'trial_review'
  | 'agent_inference';

export type MemoryVisibility =
  | 'private_to_actor'
  | 'internal_only'
  | 'company_scoped'
  | 'cross_role_allowed';

export type MemoryEventMeta = {
  type: MemoryEventType;
  actorType: MemoryActorType;
  actorId: string;
  entityType?: MemoryEntityType;
  entityId?: string;
  confidence: MemoryConfidence;
  source: MemorySource;
  visibility: MemoryVisibility;
  createdAt: string;
};

export type MemoryEvent = {
  content: string;
  containerTag: string;
  metadata: MemoryEventMeta;
};

export function makeMemoryEvent(params: {
  content: string;
  containerTag: string;
  type: MemoryEventType;
  actorType: MemoryActorType;
  actorId: string;
  entityType?: MemoryEntityType;
  entityId?: string;
  confidence?: MemoryConfidence;
  source?: MemorySource;
  visibility?: MemoryVisibility;
}): MemoryEvent {
  return {
    content: params.content,
    containerTag: params.containerTag,
    metadata: {
      type: params.type,
      actorType: params.actorType,
      actorId: params.actorId,
      entityType: params.entityType,
      entityId: params.entityId,
      confidence: params.confidence ?? 'medium',
      source: params.source ?? 'agent_inference',
      visibility: params.visibility ?? 'internal_only',
      createdAt: new Date().toISOString(),
    },
  };
}
