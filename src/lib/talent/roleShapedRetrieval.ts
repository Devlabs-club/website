import { buildSearchStrategy } from '@/lib/talent/discovery/strategy';
import { buildRoleSkillTiers } from '@/lib/talent/discovery/roleSkillTiers';
import { searchTalentSearchIndex } from '@/lib/talent/searchIndex';
import {
  hydrateSearchableBuilderPool,
  profileLimitPoolTarget,
} from '@/lib/talent/searchableBuilderPool';

export async function retrieveRoleShapedBuilderPool(params: {
  opportunity: any;
  founderId: string;
  profileLimit?: number | null;
  BuilderProfile: any;
  ProjectRecord: any;
  excludeBuilderIds?: Array<string | unknown>;
  seedBuilders?: any[];
}) {
  const {
    opportunity,
    founderId,
    profileLimit = 5,
    BuilderProfile,
    ProjectRecord,
    excludeBuilderIds = [],
    seedBuilders = [],
  } = params;

  const strategy = buildSearchStrategy({ opportunity, founderId, searchMode: 'balanced' });
  const tiers = buildRoleSkillTiers(opportunity);
  const poolTarget = profileLimitPoolTarget(profileLimit);
  const roleEvidenceTerms: string[] = [
    ...(opportunity?.searchPlan?.roleEvidence?.anchorConcepts || []),
    ...(opportunity?.searchPlan?.roleEvidence?.supportingConcepts || []),
  ]
    .map((term: unknown) => String(term || '').trim())
    .filter(Boolean)
    .slice(0, 20);

  let indexBuilders: any[] = [];
  try {
    const indexResult = await searchTalentSearchIndex({
      terms: [
        strategy.primaryQuery,
        ...strategy.expandedQueries,
        ...tiers.primarySkills.slice(0, 10),
        ...roleEvidenceTerms,
      ],
      limit: Math.max(poolTarget, 80),
    });
    indexBuilders = indexResult.builders;
  } catch (error) {
    console.warn('[role-shaped-retrieval] index lookup failed', error);
  }

  const seed = [...seedBuilders, ...indexBuilders];
  return hydrateSearchableBuilderPool({
    seedBuilders: seed,
    targetPoolSize: poolTarget,
    BuilderProfile,
    ProjectRecord,
    excludeBuilderIds: excludeBuilderIds.map(String),
  });
}
