import TalentEmbedding from '@/models/talent/TalentEmbedding';
import { generateEmbedding } from './embedTalentEntity';
import { isTalentSemanticScoringEnabled, talentEmbeddingScanLimit } from '@/lib/talent/discovery/semanticConfig';

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
  if (!isTalentSemanticScoringEnabled()) return [];

  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const scanLimit = talentEmbeddingScanLimit();
  const allEmbeddings = await TalentEmbedding.find({
    entityType: 'builder_profile',
    embedding: { $exists: true, $not: { $size: 0 } },
  })
    .select('entityId builderId embedding text')
    .sort({ updatedAt: -1 })
    .limit(scanLimit)
    .maxTimeMS(3000)
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
  if (!isTalentSemanticScoringEnabled()) return [];

  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const scanLimit = talentEmbeddingScanLimit();
  const allEmbeddings = await TalentEmbedding.find({
    entityType: 'project',
    embedding: { $exists: true, $not: { $size: 0 } },
  })
    .select('entityId builderId embedding text')
    .sort({ updatedAt: -1 })
    .limit(scanLimit)
    .maxTimeMS(3000)
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

  const uniqueQueries = Array.from(
    new Set(queries.map((query) => String(query || '').trim()).filter(Boolean))
  ).slice(0, 4);
  if (!uniqueQueries.length) return scoreMap;

  const queryResults = await Promise.all(
    uniqueQueries.map(async (query, index) => {
      const weight = index === 0 ? 1 : Math.max(0.78, 0.94 - index * 0.06);
      const [profileResults, projectResults] = await Promise.all([
        searchBuilderEmbeddings({ query, limit: 50, minSimilarity }),
        searchProjectEmbeddings({ query, limit: 100, minSimilarity }),
      ]);
      return { weight, profileResults, projectResults };
    })
  );

  for (const { weight, profileResults, projectResults } of queryResults) {
    for (const r of profileResults) {
      if (!r.builderId) continue;
      const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
      existing.profileScore = Math.max(existing.profileScore, r.similarity * weight);
      scoreMap.set(r.builderId, existing);
    }

    for (const r of projectResults) {
      if (!r.builderId) continue;
      const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
      existing.projectScore = Math.max(existing.projectScore, r.similarity * weight);
      scoreMap.set(r.builderId, existing);
    }
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
  const uniqueQueries = Array.from(
    new Set(queries.map((query) => String(query || '').trim()).filter(Boolean))
  ).slice(0, 4);
  const primaryQuery = uniqueQueries[0] || '';
  const scoreMap: SemanticScoreMap = new Map();

  if (!primaryQuery) {
    return { builderIds: [], scores: scoreMap, profileHitCount: 0, projectHitCount: 0, usedQuery: '' };
  }

  let profileHitCount = 0;
  let projectHitCount = 0;
  const queryResults = await Promise.all(
    uniqueQueries.map(async (query, index) => {
      const weight = index === 0 ? 1 : Math.max(0.78, 0.94 - index * 0.06);
      const [profileResults, projectResults] = await Promise.all([
        searchBuilderEmbeddings({ query, limit: profileLimit, minSimilarity }),
        searchProjectEmbeddings({ query, limit: projectLimit, minSimilarity }),
      ]);
      return { weight, profileResults, projectResults };
    })
  );

  for (const { weight, profileResults, projectResults } of queryResults) {
    profileHitCount += profileResults.length;
    projectHitCount += projectResults.length;

    for (const r of profileResults) {
      if (!r.builderId) continue;
      const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
      existing.profileScore = Math.max(existing.profileScore, r.similarity * weight);
      scoreMap.set(r.builderId, existing);
    }

    for (const r of projectResults) {
      if (!r.builderId) continue;
      const existing = scoreMap.get(r.builderId) || { profileScore: 0, projectScore: 0 };
      existing.projectScore = Math.max(existing.projectScore, r.similarity * weight);
      scoreMap.set(r.builderId, existing);
    }
  }

  const builderIds = [...scoreMap.entries()]
    .sort(([, a], [, b]) => Math.max(b.profileScore, b.projectScore) - Math.max(a.profileScore, a.projectScore))
    .map(([builderId]) => builderId)
    .slice(0, candidateLimit);

  return {
    builderIds,
    scores: scoreMap,
    profileHitCount,
    projectHitCount,
    usedQuery: primaryQuery,
  };
}
