import {
  generateOpenRouterEmbedding,
  getOpenRouterEmbeddingModel,
  hasOpenRouterEmbeddingConfig,
} from '@/lib/openrouter';

const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddableEntityType = 'builder_profile' | 'project' | 'opportunity';

export type EmbeddingInput = {
  entityType: EmbeddableEntityType;
  entityId: string;
  builderId?: string;
  data: any;
};

export type EmbeddingResult = {
  entityType: EmbeddableEntityType;
  entityId: string;
  builderId?: string;
  text: string;
  embedding: number[];
  model: string;
  dimensions: number;
};

function buildBuilderProfileText(builder: any, projects: any[]): string {
  const parts: string[] = [];

  if (builder.name) parts.push(builder.name);
  if (builder.headline) parts.push(builder.headline);
  if (builder.bio) parts.push(builder.bio.slice(0, 400));
  if (builder.universityOrCompany) parts.push(`Background: ${builder.universityOrCompany}`);

  const roles = (builder.rolePreference || []).slice(0, 12).join(', ');
  if (roles) parts.push(`Skills: ${roles}`);

  const experiences = (builder.experiences || []).slice(0, 5);
  for (const experience of experiences) {
    const eParts: string[] = [];
    if (experience.title || experience.company) {
      eParts.push(`Experience: ${[experience.title, experience.company].filter(Boolean).join(' at ')}`);
    }
    if (experience.description) eParts.push(String(experience.description).slice(0, 220));
    if ((experience.skills || []).length) eParts.push(`Experience skills: ${(experience.skills as string[]).slice(0, 6).join(', ')}`);
    if (eParts.length) parts.push(eParts.join('. '));
  }

  const rankedProjects = [...(projects || [])].sort((a, b) => {
    const score = (p: any) =>
      (p.builderContribution ? 2 : 0) +
      (p.description ? 1 : 0) +
      ((p.techStack || []).length > 0 ? 1 : 0);
    return score(b) - score(a);
  });

  for (const p of rankedProjects.slice(0, 5)) {
    const pParts: string[] = [];
    if (p.projectName) pParts.push(p.projectName);
    if (p.description) pParts.push(p.description.slice(0, 200));
    if (p.builderContribution) pParts.push(`Contribution: ${p.builderContribution.slice(0, 200)}`);
    if ((p.techStack || []).length) pParts.push(`Stack: ${(p.techStack as string[]).slice(0, 8).join(', ')}`);
    if (p.problemSolved) pParts.push(`Problem: ${p.problemSolved.slice(0, 120)}`);
    if (pParts.length) parts.push(pParts.join('. '));
  }

  return parts.join('\n').slice(0, 3000);
}

function buildProjectText(project: any): string {
  const parts: string[] = [];
  if (project.projectName) parts.push(project.projectName);
  if (project.description) parts.push(project.description.slice(0, 400));
  if (project.problemSolved) parts.push(project.problemSolved.slice(0, 200));
  if (project.builderContribution) parts.push(`Built: ${project.builderContribution.slice(0, 250)}`);
  if ((project.techStack || []).length) parts.push(`Stack: ${(project.techStack as string[]).slice(0, 10).join(', ')}`);
  if ((project.contributionTags || []).length) parts.push(`Contribution: ${(project.contributionTags as string[]).join(', ')}`);
  return parts.join('\n').slice(0, 2000);
}

function buildOpportunityText(opportunity: any): string {
  const parts: string[] = [];
  if (opportunity.roleTitle) parts.push(opportunity.roleTitle);
  if (opportunity.builderWillDo) parts.push(opportunity.builderWillDo.slice(0, 400));
  if ((opportunity.skillsNeeded || []).length) parts.push(`Required: ${(opportunity.skillsNeeded as string[]).join(', ')}`);
  if ((opportunity.niceToHaveSkills || []).length) parts.push(`Nice to have: ${(opportunity.niceToHaveSkills as string[]).join(', ')}`);
  if (opportunity.startupSummary) parts.push(opportunity.startupSummary.slice(0, 250));
  if (opportunity.industry) parts.push(`Industry: ${opportunity.industry}`);
  return parts.join('\n').slice(0, 1500);
}

export function buildEmbeddingText(input: EmbeddingInput): string {
  switch (input.entityType) {
    case 'builder_profile':
      return buildBuilderProfileText(input.data.builder, input.data.projects || []);
    case 'project':
      return buildProjectText(input.data);
    case 'opportunity':
      return buildOpportunityText(input.data);
    default:
      return JSON.stringify(input.data).slice(0, 1000);
  }
}

/** True when OpenRouter (preferred) or legacy OpenAI key can produce embeddings. */
export function hasEmbeddingConfig(): boolean {
  return hasOpenRouterEmbeddingConfig() || Boolean(process.env.OPENAI_API_KEY);
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;

  if (hasOpenRouterEmbeddingConfig()) {
    return generateOpenRouterEmbedding(text, EMBEDDING_DIMENSIONS);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      console.warn('[embeddings] OpenAI API error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.warn('[embeddings] generateEmbedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export function getEmbeddingModelName(): string {
  return hasOpenRouterEmbeddingConfig() ? getOpenRouterEmbeddingModel() : 'text-embedding-3-small';
}

export async function embedTalentEntity(input: EmbeddingInput): Promise<EmbeddingResult | null> {
  const text = buildEmbeddingText(input);
  if (!text.trim()) return null;

  const embedding = await generateEmbedding(text);
  if (!embedding) return null;

  const model = getEmbeddingModelName();
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    builderId: input.builderId,
    text,
    embedding,
    model,
    dimensions: embedding.length,
  };
}
