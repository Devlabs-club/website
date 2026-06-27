import TalentEmbedding from '@/models/talent/TalentEmbedding';
import { embedTalentEntity, type EmbeddingInput } from './embedTalentEntity';
import { upsertTalentSearchIndexForBuilder } from '@/lib/talent/searchIndex';

export async function upsertTalentEmbedding(input: EmbeddingInput): Promise<boolean> {
  const result = await embedTalentEntity(input);
  if (!result) return false;

  await TalentEmbedding.findOneAndUpdate(
    { entityType: result.entityType, entityId: result.entityId },
    {
      $set: {
        entityType: result.entityType,
        entityId: result.entityId,
        builderId: result.builderId,
        text: result.text,
        embedding: result.embedding,
        model: result.model,
        dimensions: result.dimensions,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  if (result.entityType === 'builder_profile' && result.builderId) {
    void upsertTalentSearchIndexForBuilder(result.builderId);
  }

  return true;
}

export async function upsertBuilderEmbedding(params: {
  builderId: string;
  builder: any;
  projects: any[];
}): Promise<boolean> {
  return upsertTalentEmbedding({
    entityType: 'builder_profile',
    entityId: params.builderId,
    builderId: params.builderId,
    data: { builder: params.builder, projects: params.projects },
  });
}

export async function upsertProjectEmbedding(params: {
  projectId: string;
  builderId: string;
  project: any;
}): Promise<boolean> {
  return upsertTalentEmbedding({
    entityType: 'project',
    entityId: params.projectId,
    builderId: params.builderId,
    data: params.project,
  });
}

export async function upsertOpportunityEmbedding(params: {
  opportunityId: string;
  opportunity: any;
}): Promise<void> {
  void upsertTalentEmbedding({
    entityType: 'opportunity',
    entityId: params.opportunityId,
    data: params.opportunity,
  });
}
