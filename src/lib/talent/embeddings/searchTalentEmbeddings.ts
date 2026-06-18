import TalentEmbedding from '@/models/talent/TalentEmbedding';
import { generateEmbedding } from './embedTalentEntity';

export type SemanticSearchResult = {
  entityId: string;
  builderId?: string;
  entityType: string;
  similarity: number;
  text: string;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function searchBuilderEmbeddings(params: {
  query: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<SemanticSearchResult[]> {
  const { query, limit = 20, minSimilarity = 0.3 } = params;

  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const allEmbeddings = await TalentEmbedding.find({
    entityType: 'builder_profile',
    embedding: { $exists: true, $not: { $size: 0 } },
  })
    .select('entityId builderId embedding text')
    .maxTimeMS(5000)
    .lean();

  if (!allEmbeddings.length) return [];

  const results: SemanticSearchResult[] = allEmbeddings
    .map((doc: any) => ({
      entityId: doc.entityId,
      builderId: doc.builderId,
      entityType: 'builder_profile',
      similarity: cosineSimilarity(queryEmbedding, doc.embedding),
      text: doc.text,
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
}

export async function searchProjectEmbeddings(params: {
  query: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<SemanticSearchResult[]> {
  const { query, limit = 30, minSimilarity = 0.3 } = params;

  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const allEmbeddings = await TalentEmbedding.find({
    entityType: 'project',
    embedding: { $exists: true, $not: { $size: 0 } },
  })
    .select('entityId builderId embedding text')
    .maxTimeMS(5000)
    .lean();

  if (!allEmbeddings.length) return [];

  const results: SemanticSearchResult[] = allEmbeddings
    .map((doc: any) => ({
      entityId: doc.entityId,
      builderId: doc.builderId,
      entityType: 'project',
      similarity: cosineSimilarity(queryEmbedding, doc.embedding),
      text: doc.text,
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
}

export type SemanticScoreMap = Map<string, { profileScore: number; projectScore: number }>;

export type SemanticRetrievalResult = {
  builderIds: string[];
  scores: SemanticScoreMap;
  profileHitCount: number;
  projectHitCount: number;
  usedQuery: string;
};

export async function buildSemanticScoreMap(params: {
  queries: string[];
  minSimilarity?: number;
}): Promise<SemanticScoreMap> {
  const { queries, minSimilarity = 0.25 } = params;
  const scoreMap: SemanticScoreMap = new Map();

  if (!queries.length) return scoreMap;

  const primaryQuery = queries[0];

  const [profileResults, projectResults] = await Promise.all([
    searchBuilderEmbeddings({ query: primaryQuery, limit: 50, minSimilarity }),
    searchProjectEmbeddings({ query: primaryQuery, limit: 100, minSimilarity }),
  ]);

  for (const r of profileResults) {
    if (!r.builderId) continue;
    const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
    existing.profileScore = Math.max(existing.profileScore, r.similarity);
    scoreMap.set(r.builderId, existing);
  }

  for (const r of projectResults) {
    if (!r.builderId) continue;
    const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
    existing.projectScore = Math.max(existing.projectScore, r.similarity);
    scoreMap.set(r.builderId, existing);
  }

  return scoreMap;
}

export async function retrieveSemanticBuilderCandidates(params: {
  queries: string[];
  profileLimit?: number;
  projectLimit?: number;
  candidateLimit?: number;
  minSimilarity?: number;
}): Promise<SemanticRetrievalResult> {
  const {
    queries,
    profileLimit = 100,
    projectLimit = 180,
    candidateLimit = 220,
    minSimilarity = 0.22,
  } = params;
  const primaryQuery = queries.find((query) => query.trim()) || '';
  const scoreMap: SemanticScoreMap = new Map();

  if (!primaryQuery) {
    return { builderIds: [], scores: scoreMap, profileHitCount: 0, projectHitCount: 0, usedQuery: '' };
  }

  const [profileResults, projectResults] = await Promise.all([
    searchBuilderEmbeddings({ query: primaryQuery, limit: profileLimit, minSimilarity }),
    searchProjectEmbeddings({ query: primaryQuery, limit: projectLimit, minSimilarity }),
  ]);

  for (const r of profileResults) {
    if (!r.builderId) continue;
    const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
    existing.profileScore = Math.max(existing.profileScore, r.similarity);
    scoreMap.set(r.builderId, existing);
  }

  for (const r of projectResults) {
    if (!r.builderId) continue;
    const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
    existing.projectScore = Math.max(existing.projectScore, r.similarity);
    scoreMap.set(r.builderId, existing);
  }

  const builderIds = [...scoreMap.entries()]
    .sort(([, a], [, b]) => Math.max(b.profileScore, b.projectScore) - Math.max(a.profileScore, a.projectScore))
    .map(([builderId]) => builderId)
    .slice(0, candidateLimit);

  return {
    builderIds,
    scores: scoreMap,
    profileHitCount: profileResults.length,
    projectHitCount: projectResults.length,
    usedQuery: primaryQuery,
  };
}
