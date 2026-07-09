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
