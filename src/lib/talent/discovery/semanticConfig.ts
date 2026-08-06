import { hasEmbeddingConfig } from '@/lib/talent/embeddings/embedTalentEntity';

const MAX_EMBEDDING_SCAN = Number(process.env.TALENT_EMBEDDING_SCAN_LIMIT || 350);

export function isTalentSemanticScoringEnabled() {
  const flag = String(process.env.TALENT_DISCOVERY_SEMANTIC || 'auto').trim().toLowerCase();
  if (['0', 'false', 'no', 'off', 'disabled'].includes(flag)) return false;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(flag)) return hasEmbeddingConfig();
  return hasEmbeddingConfig();
}

export function talentEmbeddingScanLimit() {
  return Number.isFinite(MAX_EMBEDDING_SCAN) && MAX_EMBEDDING_SCAN > 0 ? MAX_EMBEDDING_SCAN : 350;
}

/**
 * Gates the new Atlas $vectorSearch retrieval channel (talentembeddings_v2 /
 * talentembeddingvectors_search, index "talent-v2-vector-index"). Unlike
 * TALENT_DISCOVERY_SEMANTIC this defaults OFF — the index and data are new
 * and unvalidated in production, so it requires an explicit opt-in rather
 * than "auto" behavior tied only to embedding-config presence.
 */
export function isTalentVectorSearchV2Enabled() {
  const flag = String(process.env.TALENT_DISCOVERY_VECTOR_V2 || 'off').trim().toLowerCase();
  if (!['1', 'true', 'yes', 'on', 'enabled'].includes(flag)) return false;
  return hasEmbeddingConfig();
}
