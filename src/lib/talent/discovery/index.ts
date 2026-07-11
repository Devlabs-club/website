import { buildSearchStrategy, type SearchMode, type SearchStrategy } from './strategy';
import {
  scoreBuilderFromProfile,
  computeOverallFit,
  scoreMatchLabel,
  scoreConfidence,
  buildCandidateExplanation,
  type ScoredCandidate,
  type CandidateScoreComponents,
} from './scoring';
import { builderHasPrimaryDomainMatch } from './roleSkillTiers';
import { buildSearchQualityReport, type SearchQualityReport } from './searchQuality';
import { rerankTopCandidates } from './rerank';
import { adjustWeightsFromFeedback, type CandidateFeedbackRecord } from './feedback';
import { buildSemanticScoreMap, type SemanticScoreMap } from '@/lib/talent/embeddings/searchTalentEmbeddings';
import { isTalentSemanticScoringEnabled } from './semanticConfig';
import { buildRequirementFindings } from '@/lib/talent/searchTokens';
import {
  applyMustHavePenalties,
  capOverallFitForMustGate,
  evaluateMustHaveGate,
  type MustHaveGateResult,
} from './mustHaveGate';

export type DiscoveryInput = {
  opportunity: any;
  founderId: string;
  builders: any[];
  projectsByBuilder: Map<string, any[]>;
  wrappedByBuilder?: Map<string, { report?: any; score?: number | null }>;
  searchMode?: SearchMode;
  feedbackHistory?: CandidateFeedbackRecord[];
  enableLlmRerank?: boolean;
  generateReply?: (systemPrompt: string, userPrompt: string) => Promise<string>;
  semanticScores?: SemanticScoreMap;
  skipSemanticScoring?: boolean;
  limit?: number;
};

export type RankedCandidate = ScoredCandidate & {
  builder: any;
  projects: any[];
  mustHaveGate: MustHaveGateResult;
};

export type DiscoveryResult = {
  opportunityId: string;
  searchStrategy: SearchStrategy;
  candidates: RankedCandidate[];
  searchQuality: SearchQualityReport;
  totalScanned: number;
  generatedAt: Date;
};

export async function runFounderDiscoveryPipeline(input: DiscoveryInput): Promise<DiscoveryResult> {
  const {
    opportunity,
    founderId,
    builders,
    projectsByBuilder,
    wrappedByBuilder = new Map(),
    searchMode = 'balanced',
    feedbackHistory = [],
    enableLlmRerank = false,
    generateReply,
    semanticScores: providedSemanticScores,
    skipSemanticScoring = false,
    limit = 12,
  } = input;

  const oppId = String(opportunity._id ?? '');

  // Stage 1: build search strategy
  let strategy = buildSearchStrategy({ opportunity, founderId, searchMode });

  // Stage 2: apply feedback adjustments to weights
  if (feedbackHistory.length > 0) {
    strategy = { ...strategy, weights: adjustWeightsFromFeedback(strategy.weights, feedbackHistory) };
  }

  // Stage 3a: optional semantic similarity — skipped when index retrieval already narrowed the pool.
  let semanticScores = providedSemanticScores || new Map<string, { profileScore: number; projectScore: number }>();
  const shouldRunSemantic =
    !skipSemanticScoring &&
    !providedSemanticScores &&
    isTalentSemanticScoringEnabled() &&
    builders.length > 0 &&
    builders.length <= 40;

  if (shouldRunSemantic) {
    try {
      semanticScores = await Promise.race([
        buildSemanticScoreMap({
          queries: [strategy.primaryQuery, ...strategy.expandedQueries.slice(0, 1)],
          minSimilarity: 0.25,
        }),
        new Promise<Map<string, { profileScore: number; projectScore: number }>>((resolve) =>
          setTimeout(() => resolve(new Map()), 2500)
        ),
      ]);
    } catch (error) {
      console.warn('[founder-discovery] semantic scoring skipped', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (!providedSemanticScores) {
    semanticScores = new Map();
  }

  // Stage 3b: score all builders (must-have gate applied before final fit)
  const allScored: RankedCandidate[] = [];
  for (const builder of builders) {
    const builderId = String(builder._id);
    const projects = projectsByBuilder.get(builderId) ?? [];

    let components = scoreBuilderFromProfile({
      builder,
      projects,
      opportunity,
      mustHaveSignals: strategy.mustHaveSignals,
      proofSignals: strategy.proofSignals,
      roleSkillTiers: strategy.roleSkillTiers,
      hasUploadedAgentTrace: Boolean(wrappedByBuilder.get(builderId)),
      agentWrappedScore: wrappedByBuilder.get(builderId)?.score ?? null,
    });

    const requirementFindings = buildRequirementFindings(opportunity, builder, projects);
    const mustHaveGate = evaluateMustHaveGate(opportunity, requirementFindings);
    components = applyMustHavePenalties(components, mustHaveGate);

    // Inject semantic scores if available
    const sem = semanticScores.get(builderId);
    if (sem) {
      components.semanticRoleFit = sem.profileScore;
      components.semanticProjectFit = sem.projectScore;
    }

    let overallFit = computeOverallFit(components, strategy.weights);
    overallFit = capOverallFitForMustGate(overallFit, mustHaveGate);
    const matchLabel = scoreMatchLabel(overallFit);
    const confidence = scoreConfidence(components);
    const explanation = buildCandidateExplanation({
      builder,
      projects,
      components,
      opportunity,
      searchStrategy: strategy,
      roleSkillTiers: strategy.roleSkillTiers,
    });

    const sources: string[] = ['deterministic_keyword'];
    if (sem?.profileScore && sem.profileScore > 0.3) sources.push('semantic_profile');
    if (sem?.projectScore && sem.projectScore > 0.3) sources.push('semantic_project');
    if (wrappedByBuilder.has(builderId)) sources.push('agent_trace');

    allScored.push({
      builderId,
      overallFit,
      components,
      confidence,
      explanation,
      matchLabel,
      retrievalSources: sources,
      builder,
      projects,
      mustHaveGate,
    });
  }

  // Stage 4: must-passers first, then overallFit descending
  allScored.sort((a, b) => {
    if (a.mustHaveGate.passesMustGate !== b.mustHaveGate.passesMustGate) {
      return a.mustHaveGate.passesMustGate ? -1 : 1;
    }
    return b.overallFit - a.overallFit;
  });

  // Stage 5: one batched LLM nudge over top 12 (SearchPlan already expanded categories)
  let finalCandidates: RankedCandidate[];
  if (enableLlmRerank && generateReply) {
    const builderMap = new Map(allScored.map((c) => [c.builderId, { builder: c.builder, projects: c.projects }]));
    const reranked = await rerankTopCandidates({
      candidates: allScored.slice(0, 12),
      opportunity,
      builderMap,
      generateReply,
      limit: 12,
    });
    finalCandidates = [
      ...reranked as RankedCandidate[],
      ...allScored.slice(12),
    ];
  } else {
    finalCandidates = allScored;
  }

  finalCandidates.sort((a, b) => {
    if (a.mustHaveGate.passesMustGate !== b.mustHaveGate.passesMustGate) {
      return a.mustHaveGate.passesMustGate ? -1 : 1;
    }
    return b.overallFit - a.overallFit;
  });

  const tiers = strategy.roleSkillTiers;
  const primaryMatched = finalCandidates.filter((candidate) =>
    builderHasPrimaryDomainMatch(tiers, candidate.builder, candidate.projects)
  );
  const primaryFallback = finalCandidates.filter((candidate) =>
    !builderHasPrimaryDomainMatch(tiers, candidate.builder, candidate.projects)
  );
  const rankedForReturn = tiers.requiresPrimaryMatch && primaryMatched.length > 0
    ? [...primaryMatched, ...primaryFallback]
    : finalCandidates;

  const returnedCandidates = rankedForReturn.slice(0, limit);

  // Stage 6: search quality report for the shortlist founders actually see
  const searchQuality = buildSearchQualityReport({
    totalScanned: builders.length,
    scored: returnedCandidates,
    opportunity,
    searchMode,
  });

  return {
    opportunityId: oppId,
    searchStrategy: strategy,
    candidates: returnedCandidates,
    searchQuality,
    totalScanned: builders.length,
    generatedAt: new Date(),
  };
}

export { buildSearchStrategy, computeDynamicWeights, type SearchStrategy, type SearchMode } from './strategy';
export { buildSearchQualityReport, type SearchQualityReport } from './searchQuality';
export { type ScoredCandidate } from './scoring';
export { type CandidateFeedbackRecord } from './feedback';
