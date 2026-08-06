import { buildSearchStrategy } from '@/lib/talent/discovery/strategy';
import { buildRoleSkillTiers } from '@/lib/talent/discovery/roleSkillTiers';
import { searchTalentSearchIndex } from '@/lib/talent/searchIndex';
import {
  hydrateSearchableBuilderPool,
  profileLimitPoolTarget,
} from '@/lib/talent/searchableBuilderPool';
import { getPlanEvidenceDimensions } from '@/lib/talent/searchPlan';
import { vectorSearchTalentBuilders } from '@/lib/talent/embeddings/searchTalentEmbeddingsV2';

function uniqueTrimmed(values: Array<string | null | undefined>, max = 24): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = String(value || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

function builderKey(entry: any): string | null {
  const id = String(entry?._id || entry?.builderId || '').trim();
  return id || null;
}

/**
 * Merge channel results with reserved quotas so domain specialists keep seats
 * even when stack/ship terms dominate index ranking.
 */
export function mergeChannelBuilders(params: {
  domain: any[];
  must: any[];
  stack: any[];
  vector?: any[];
  poolTarget: number;
}): any[] {
  const vector = params.vector || [];
  // No vector channel (disabled/errored/no hits) => identical quotas to before this
  // channel existed, so behavior is unchanged unless it actually returns results.
  const hasVector = vector.length > 0;
  const domainQuota = Math.max(8, Math.round(params.poolTarget * (hasVector ? 0.32 : 0.4)));
  const mustQuota = Math.max(6, Math.round(params.poolTarget * (hasVector ? 0.2 : 0.25)));
  const stackQuota = Math.max(6, Math.round(params.poolTarget * (hasVector ? 0.2 : 0.25)));
  const vectorQuota = hasVector ? Math.max(6, Math.round(params.poolTarget * 0.2)) : 0;
  const fillQuota = Math.max(
    4,
    params.poolTarget - domainQuota - mustQuota - stackQuota - vectorQuota
  );

  const selected: any[] = [];
  const seen = new Set<string>();

  const take = (builders: any[], quota: number) => {
    let taken = 0;
    for (const builder of builders) {
      if (taken >= quota) break;
      const id = builderKey(builder);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      selected.push(builder);
      taken += 1;
    }
  };

  take(params.domain, domainQuota);
  take(params.must, mustQuota);
  take(params.stack, stackQuota);
  if (hasVector) take(vector, vectorQuota);

  // Fill remaining seats from leftover channel results in domain → must → stack → vector order.
  const leftovers = [...params.domain, ...params.must, ...params.stack, ...vector];
  take(leftovers, fillQuota + Math.max(0, params.poolTarget - selected.length));

  return selected.slice(0, params.poolTarget);
}

export function buildRetrievalChannels(params: {
  opportunity: any;
  founderId: string;
}): {
  domainTerms: string[];
  mustTerms: string[];
  stackTerms: string[];
  strategy: ReturnType<typeof buildSearchStrategy>;
} {
  const { opportunity, founderId } = params;
  const strategy = buildSearchStrategy({ opportunity, founderId, searchMode: 'balanced' });
  const tiers = buildRoleSkillTiers(opportunity);
  const dimensions = getPlanEvidenceDimensions(opportunity?.searchPlan);
  const domainDimension = dimensions.find((dimension) => dimension.id === 'domain_depth');

  const domainTerms = uniqueTrimmed(
    [
      ...(opportunity?.searchPlan?.roleEvidence?.anchorConcepts || []),
      ...(domainDimension?.retrievalTerms || []),
      ...(domainDimension?.matchAnyOf || []),
    ],
    20
  );

  const mustRequirements = Array.isArray(opportunity?.searchPlan?.requirements)
    ? opportunity.searchPlan.requirements.filter(
        (requirement: any) =>
          String(requirement?.importance || '') === 'must' &&
          ['category', 'literal', 'project_evidence', 'other'].includes(String(requirement?.mode || ''))
      )
    : [];
  const mustTerms = uniqueTrimmed(
    mustRequirements.flatMap((requirement: any) => [
      ...(requirement.retrievalTerms || []),
      ...(requirement.matchAnyOf || []).slice(0, 6),
      requirement.text,
    ]),
    20
  );

  const shipDimension = dimensions.find((dimension) => dimension.id === 'ship_proof');
  const stackDimension = dimensions.find((dimension) => dimension.id === 'stack_fit');
  const stackTerms = uniqueTrimmed(
    [
      strategy.primaryQuery,
      ...strategy.expandedQueries.slice(0, 4),
      ...tiers.primarySkills.slice(0, 10),
      ...(opportunity?.skillsNeeded || []).slice(0, 8),
      ...(stackDimension?.retrievalTerms || []).slice(0, 6),
      ...(shipDimension?.retrievalTerms || []).slice(0, 4),
    ],
    24
  );

  return { domainTerms, mustTerms, stackTerms, strategy };
}

async function searchChannel(terms: string[], limit: number): Promise<any[]> {
  if (!terms.length || limit <= 0) return [];
  try {
    const result = await searchTalentSearchIndex({ terms, limit });
    return result.builders || [];
  } catch (error) {
    console.warn('[role-shaped-retrieval] channel lookup failed', error);
    return [];
  }
}

/** Atlas $vectorSearch channel (talentembeddings_v2). Already hard-timed and
 * self-fallback-to-[] inside vectorSearchTalentBuilders — this just adapts
 * its output to the {_id} shape the other channels return. */
async function vectorChannel(queryText: string, limit: number): Promise<any[]> {
  if (!queryText.trim() || limit <= 0) return [];
  try {
    const matches = await vectorSearchTalentBuilders({ queryText, limit });
    return matches.map((match) => ({ _id: match.builderId }));
  } catch (error) {
    console.warn('[role-shaped-retrieval] vector channel lookup failed', error);
    return [];
  }
}

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

  const poolTarget = profileLimitPoolTarget(profileLimit);
  const channels = buildRetrievalChannels({ opportunity, founderId });

  const domainLimit = Math.max(24, Math.round(poolTarget * 0.55));
  const mustLimit = Math.max(16, Math.round(poolTarget * 0.4));
  const stackLimit = Math.max(16, Math.round(poolTarget * 0.4));
  const vectorLimit = Math.max(16, Math.round(poolTarget * 0.4));

  // V2 vector channel (main): query is role-shaped from the compiled plan —
  // primary query plus domain anchors — so semantic retrieval follows the same
  // center of gravity as the lexical domain channel, not a stack-heavy blob.
  const vectorQuery = uniqueTrimmed(
    [channels.strategy.primaryQuery, ...channels.domainTerms.slice(0, 10)],
    12
  ).join(' ');

  const [domainBuilders, mustBuilders, stackBuilders, vectorBuilders] = await Promise.all([
    searchChannel(channels.domainTerms, domainLimit),
    searchChannel(channels.mustTerms, mustLimit),
    searchChannel(channels.stackTerms, stackLimit),
    vectorChannel(vectorQuery, vectorLimit),
  ]);

  const merged = mergeChannelBuilders({
    domain: domainBuilders,
    must: mustBuilders,
    stack: stackBuilders,
    vector: vectorBuilders,
    poolTarget,
  });

  // If domain/must channels were empty (thin plans), fall back to a single blended query.
  let seed = [...seedBuilders, ...merged];
  if (merged.length < Math.min(12, poolTarget)) {
    try {
      const fallback = await searchTalentSearchIndex({
        terms: uniqueTrimmed(
          [
            ...channels.domainTerms,
            ...channels.mustTerms,
            ...channels.stackTerms,
            channels.strategy.primaryQuery,
          ],
          28
        ),
        limit: Math.max(poolTarget, 80),
      });
      seed = [...seed, ...(fallback.builders || [])];
    } catch (error) {
      console.warn('[role-shaped-retrieval] fallback index lookup failed', error);
    }
  }

  return hydrateSearchableBuilderPool({
    seedBuilders: seed,
    targetPoolSize: poolTarget,
    BuilderProfile,
    ProjectRecord,
    excludeBuilderIds: excludeBuilderIds.map(String),
  });
}
