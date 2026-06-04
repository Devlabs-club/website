const EMBEDDING_MODEL = 'text-embedding-3-small';
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
  if (builder.bio) parts.push(builder.bio.slice(0, 300));

  const roles = (builder.rolePreference || []).slice(0, 6).join(', ');
  if (roles) parts.push(`Skills and roles: ${roles}`);

  const topProjects = (projects || []).slice(0, 3);
  for (const p of topProjects) {
    const pParts: string[] = [];
    if (p.projectName) pParts.push(p.projectName);
    if (p.description) pParts.push(p.description.slice(0, 150));
    if (p.builderContribution) pParts.push(p.builderContribution.slice(0, 150));
    if ((p.techStack || []).length) pParts.push((p.techStack as string[]).slice(0, 5).join(' '));
    if (pParts.length) parts.push(pParts.join('. '));
  }

  return parts.join('\n').slice(0, 2000);
}

function buildProjectText(project: any): string {
  const parts: string[] = [];
  if (project.projectName) parts.push(project.projectName);
  if (project.description) parts.push(project.description.slice(0, 300));
  if (project.problemSolved) parts.push(project.problemSolved.slice(0, 200));
  if (project.builderContribution) parts.push(`Built: ${project.builderContribution.slice(0, 200)}`);
  if ((project.techStack || []).length) parts.push(`Stack: ${(project.techStack as string[]).slice(0, 8).join(', ')}`);
  if ((project.contributionTags || []).length) parts.push(`Contribution: ${(project.contributionTags as string[]).join(', ')}`);
  return parts.join('\n').slice(0, 1500);
}

function buildOpportunityText(opportunity: any): string {
  const parts: string[] = [];
  if (opportunity.roleTitle) parts.push(opportunity.roleTitle);
  if (opportunity.builderWillDo) parts.push(opportunity.builderWillDo.slice(0, 300));
  if ((opportunity.skillsNeeded || []).length) parts.push(`Required: ${(opportunity.skillsNeeded as string[]).join(', ')}`);
  if ((opportunity.niceToHaveSkills || []).length) parts.push(`Nice to have: ${(opportunity.niceToHaveSkills as string[]).join(', ')}`);
  if (opportunity.startupSummary) parts.push(opportunity.startupSummary.slice(0, 200));
  return parts.join('\n').slice(0, 1200);
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

function getOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;
  if (!text.trim()) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
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

export async function embedTalentEntity(input: EmbeddingInput): Promise<EmbeddingResult | null> {
  const text = buildEmbeddingText(input);
  if (!text.trim()) return null;

  const embedding = await generateEmbedding(text);
  if (!embedding) return null;

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    builderId: input.builderId,
    text,
    embedding,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}
