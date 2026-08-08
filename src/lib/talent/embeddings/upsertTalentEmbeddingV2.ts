import { createHash } from 'crypto';
import TalentEmbeddingV2 from '@/models/talent/TalentEmbeddingV2';
import TalentEmbeddingVectorSearch from '@/models/talent/TalentEmbeddingVectorSearch';
import {
  generateEmbedding,
  getEmbeddingModelName,
  hasEmbeddingConfig,
} from './embedTalentEntity';

const EMBEDDING_DIMENSIONS = 1536;
/** Live writes share one version tag so search can find them without a re-backfill. */
export const TALENT_EMBEDDING_V2_VERSION = 'talent-v2-live';

type V2DocumentType = 'builder_profile' | 'project' | 'experience';

type V2DocDraft = {
  documentType: V2DocumentType;
  entityId: string;
  builderId: string;
  text: string;
  sources: string[];
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function vectorKey(model: string, contentHash: string) {
  return sha256(`${model}|${EMBEDDING_DIMENSIONS}|${contentHash}`);
}

function experienceEntityKey(experience: any, index: number) {
  if (typeof experience?.sourceId === 'string' && experience.sourceId.trim()) {
    return sha256(experience.sourceId.trim()).slice(0, 24);
  }
  return sha256(
    [experience?.title, experience?.company, experience?.dateRange, String(index)].map(String).join('|')
  ).slice(0, 24);
}

function buildExperienceText(experience: any): string {
  const title = String(experience?.title || '').trim();
  const company = String(experience?.company || '').trim();
  const description = String(experience?.description || '').replace(/\s+/g, ' ').trim();
  if (!title && !company) return '';
  const head = `Experience: ${[title, company].filter(Boolean).join(' at ')}.`;
  return [head, description].filter(Boolean).join(' ').slice(0, 2000);
}

function buildProjectTextV2(project: any): string {
  const name = String(project?.projectName || '').trim();
  if (!name) return '';
  const parts = [`Project: ${name}.`];
  const description = String(project?.description || '').replace(/\s+/g, ' ').trim();
  if (description) parts.push(description);
  const contribution = String(project?.builderContribution || '').replace(/\s+/g, ' ').trim();
  if (contribution) parts.push(`Builder contribution: ${contribution}`);
  const stack = Array.isArray(project?.techStack)
    ? project.techStack.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 10)
    : [];
  if (stack.length) parts.push(`Stack: ${stack.join(', ')}`);
  return parts.join(' ').slice(0, 2000);
}

function buildBuilderProfileTextV2(builder: any): string {
  const parts: string[] = [];
  if (builder?.headline) parts.push(`Headline: ${String(builder.headline).trim()}`);
  const bio = String(builder?.bio || '').replace(/\s+/g, ' ').trim();
  if (bio) parts.push(`Background: ${bio.slice(0, 1800)}`);
  else if (builder?.universityOrCompany) {
    parts.push(`Background: ${String(builder.universityOrCompany).trim()}`);
  }
  const skills = Array.isArray(builder?.skills)
    ? builder.skills.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 20)
    : [];
  if (skills.length) parts.push(`Skills: ${skills.join(', ')}`);
  return parts.join('\n').slice(0, 5000);
}

function draftDocsForBuilder(params: { builderId: string; builder: any; projects: any[] }): V2DocDraft[] {
  const builderId = String(params.builderId);
  const docs: V2DocDraft[] = [];

  const profileText = buildBuilderProfileTextV2(params.builder);
  if (profileText.trim()) {
    docs.push({
      documentType: 'builder_profile',
      entityId: builderId,
      builderId,
      text: profileText,
      sources: ['builder_profile'],
    });
  }

  const experiences = Array.isArray(params.builder?.experiences) ? params.builder.experiences : [];
  experiences.slice(0, 20).forEach((experience: any, index: number) => {
    const text = buildExperienceText(experience);
    if (!text.trim()) return;
    docs.push({
      documentType: 'experience',
      entityId: `${builderId}:experience:${experienceEntityKey(experience, index)}`,
      builderId,
      text,
      sources: [typeof experience?.source === 'string' ? experience.source : 'builder_profile'],
    });
  });

  for (const project of params.projects || []) {
    const text = buildProjectTextV2(project);
    if (!text.trim()) continue;
    const projectId = String(project?._id || project?.id || '').trim();
    if (!projectId) continue;
    docs.push({
      documentType: 'project',
      entityId: projectId,
      builderId,
      text,
      sources: ['projectrecords'],
    });
  }

  return docs;
}

/**
 * Upsert builder profile + experience + project documents into the V2 index
 * (talentembeddings_v2 + talentembeddingvectors_search) used by Atlas $vectorSearch.
 */
export async function upsertBuilderEmbeddingV2(params: {
  builderId: string;
  builder: any;
  projects: any[];
}): Promise<{ documents: number; vectorsCreated: number } | null> {
  if (!hasEmbeddingConfig()) return null;

  const builderId = String(params.builderId);
  const drafts = draftDocsForBuilder(params);
  if (!drafts.length) return null;

  const model = getEmbeddingModelName();
  const now = new Date();

  // Drop prior V2 rows for this builder (any version / id shape) so search doesn't return stale dupes.
  const builderIdVariants: Array<string | import('mongoose').Types.ObjectId> = [builderId];
  try {
    const { Types } = await import('mongoose');
    if (Types.ObjectId.isValid(builderId)) builderIdVariants.push(new Types.ObjectId(builderId));
  } catch {
    // ignore
  }
  await TalentEmbeddingV2.collection.deleteMany({ builderId: { $in: builderIdVariants as any[] } });

  let vectorsCreated = 0;
  for (const draft of drafts) {
    const contentHash = sha256(draft.text);
    const key = vectorKey(model, contentHash);

    const existingVector = await TalentEmbeddingVectorSearch.findOne({ vectorKey: key })
      .select('_id')
      .lean();

    if (!existingVector) {
      const embedding = await generateEmbedding(draft.text);
      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        console.warn('[embeddings-v2] failed to embed document', draft.documentType, draft.entityId);
        continue;
      }
      await TalentEmbeddingVectorSearch.findOneAndUpdate(
        { vectorKey: key },
        {
          $set: {
            vectorKey: key,
            contentHash,
            model,
            dimensions: EMBEDDING_DIMENSIONS,
            embedding,
            updatedAt: now,
            lastUsedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
      vectorsCreated += 1;
    } else {
      await TalentEmbeddingVectorSearch.updateOne(
        { vectorKey: key },
        { $set: { updatedAt: now, lastUsedAt: now } }
      );
    }

    await TalentEmbeddingV2.findOneAndUpdate(
      {
        embeddingVersion: TALENT_EMBEDDING_V2_VERSION,
        documentType: draft.documentType,
        entityId: draft.entityId,
      },
      {
        $set: {
          embeddingVersion: TALENT_EMBEDDING_V2_VERSION,
          documentType: draft.documentType,
          entityId: draft.entityId,
          // Store as string to match the Aug 6 backfill (search joins on vectorKey either way).
          builderId: builderId as any,
          text: draft.text,
          contentHash,
          vectorKey: key,
          model,
          dimensions: EMBEDDING_DIMENSIONS,
          sources: draft.sources,
          quality: { evidenceUnits: draft.documentType === 'builder_profile' ? drafts.length : 1 },
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }

  return { documents: drafts.length, vectorsCreated };
}
