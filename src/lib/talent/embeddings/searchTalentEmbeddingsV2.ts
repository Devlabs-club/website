import TalentEmbeddingV2 from '@/models/talent/TalentEmbeddingV2';
import TalentEmbeddingVectorSearch from '@/models/talent/TalentEmbeddingVectorSearch';
import { generateEmbedding } from './embedTalentEntity';
import { isTalentVectorSearchV2Enabled } from '@/lib/talent/discovery/semanticConfig';

const VECTOR_INDEX_NAME = 'talent-v2-vector-index';
const VECTOR_SEARCH_TIMEOUT_MS = 2000;

export type VectorSearchBuilderMatch = {
  builderId: string;
  score: number;
  documentType: string;
};

function withHardTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Atlas $vectorSearch over talentembeddingvectors_search, joined back to
 * talentembeddings_v2 (which carries builderId) on vectorKey. A builder can
 * have several matching documents (profile / project / experience) — this
 * rolls up to one entry per builder using their single best-scoring match.
 *
 * Hard-timed at VECTOR_SEARCH_TIMEOUT_MS: on timeout or any error this
 * resolves to [] rather than throwing, so callers can just treat it as one
 * retrieval channel among several and fall back to keyword search.
 */
export async function vectorSearchTalentBuilders(params: {
  queryText: string;
  limit?: number;
  numCandidates?: number;
}): Promise<VectorSearchBuilderMatch[]> {
  if (!isTalentVectorSearchV2Enabled()) return [];
  const { queryText, limit = 40, numCandidates = 200 } = params;
  if (!queryText.trim()) return [];

  return withHardTimeout(runVectorSearch(queryText, limit, numCandidates), VECTOR_SEARCH_TIMEOUT_MS, []);
}

async function runVectorSearch(
  queryText: string,
  limit: number,
  numCandidates: number
): Promise<VectorSearchBuilderMatch[]> {
  try {
    const queryVector = await generateEmbedding(queryText);
    if (!queryVector) return [];

    const vectorHits = await TalentEmbeddingVectorSearch.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector,
          numCandidates,
          limit: numCandidates,
        },
      },
      {
        $project: {
          _id: 0,
          vectorKey: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);

    if (!vectorHits.length) return [];

    const scoreByVectorKey = new Map<string, number>(
      vectorHits.map((hit: any) => [String(hit.vectorKey), Number(hit.score) || 0])
    );

    const entities = await TalentEmbeddingV2.find({
      vectorKey: { $in: [...scoreByVectorKey.keys()] },
    })
      .select('builderId vectorKey documentType')
      .maxTimeMS(1500)
      .lean();

    const bestByBuilder = new Map<string, VectorSearchBuilderMatch>();
    for (const entity of entities as any[]) {
      const builderId = String(entity.builderId);
      const score = scoreByVectorKey.get(String(entity.vectorKey)) || 0;
      const existing = bestByBuilder.get(builderId);
      if (!existing || score > existing.score) {
        bestByBuilder.set(builderId, { builderId, score, documentType: entity.documentType });
      }
    }

    return [...bestByBuilder.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (error) {
    console.warn('[talent-vector-search-v2] query failed', error instanceof Error ? error.message : error);
    return [];
  }
}
