import { buildSearchStrategy, type SearchMode, type SearchStrategy } from './strategy';
import {
  scoreBuilderFromProfile,
  computeOverallFit,
  scoreMatchLabel,
  scoreConfidence,
  buildCandidateExplanation,
  type ScoredCandidate,
} from './scoring';
import { builderHasPrimaryDomainMatch } from './roleSkillTiers';
import { buildSearchQualityReport, type SearchQualityReport } from './searchQuality';
import { rerankTopCandidates } from './rerank';
import { adjustWeightsFromFeedback, type CandidateFeedbackRecord } from './feedback';
import { buildSemanticScoreMap, type SemanticScoreMap } from '@/lib/talent/embeddings/searchTalentEmbeddings';
import { isTalentSemanticScoringEnabled } from './semanticConfig';
import { buildRequirementFindings, evaluateRoleEvidence } from '@/lib/talent/searchTokens';
import {
  applyMustHavePenalties,
  capOverallFitForMustGate,
  evaluateMustHaveGate,
  type MustHaveGateResult,
} from './mustHaveGate';
import {
  ensureGithubActivityForBuilders,
  type GithubActivitySnapshot,
} from '@/lib/talent/githubActivity';
import {
  inferSponsorshipNeed,
  opportunityDoesNotSponsor,
  shouldHardExcludeForSponsorship,
  summarizeSponsorshipCoverage,
  type SponsorshipInference,
} from '@/lib/talent/sponsorshipInference';
import {
  buildRoleEvidenceDossier,
  expandDomainProofTerms,
  opportunityRequiresInternship,
  type RoleEvidenceDossier,
} from '@/lib/talent/roleEvidenceDossier';
import {
  buildFallbackSearchPlan,
  getPlanEvidenceDimensions,
} from '@/lib/talent/searchPlan';
import {
  scoreRoleDimensions,
  type RoleDimensionScore,
} from '@/lib/talent/roleEvidenceDimensions';

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
  /** Builder IDs previously shown that now fail new constraints — demote/exclude. */
  excludeBuilderIds?: string[];
  persistGithubActivity?: (builderId: string, snapshot: GithubActivitySnapshot) => Promise<void>;
};

export type RankedCandidate = ScoredCandidate & {
  builder: any;
  projects: any[];
  mustHaveGate: MustHaveGateResult;
  sponsorship?: SponsorshipInference;
  githubActivity?: GithubActivitySnapshot | null;
  evidenceDossier?: RoleEvidenceDossier | null;
  roleDimensionScore?: RoleDimensionScore | null;
};

export type DiscoveryResult = {
  opportunityId: string;
  searchStrategy: SearchStrategy;
  candidates: RankedCandidate[];
  searchQuality: SearchQualityReport;
  totalScanned: number;
  generatedAt: Date;
  sponsorshipCoverage?: ReturnType<typeof summarizeSponsorshipCoverage>;
  githubActivityUsed?: boolean;
  reasoningCohortCount?: number;
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
    excludeBuilderIds = [],
    persistGithubActivity,
  } = input;

  const oppId = String(opportunity._id ?? '');
  const excludeSet = new Set(excludeBuilderIds.map(String));
  const jobDoesNotSponsor = opportunityDoesNotSponsor(opportunity);

  // Ensure every discovery run has role-shaped dimensions even if compile was skipped.
  if (!getPlanEvidenceDimensions(opportunity?.searchPlan).length) {
    const fallbackPlan = buildFallbackSearchPlan(opportunity);
    opportunity.searchPlan = {
      ...fallbackPlan,
      requirements: opportunity.searchPlan?.requirements?.length
        ? opportunity.searchPlan.requirements
        : fallbackPlan.requirements,
      roleEvidence: opportunity.searchPlan?.roleEvidence || fallbackPlan.roleEvidence,
    };
  }

  // Stage 1: build search strategy
  let strategy = buildSearchStrategy({ opportunity, founderId, searchMode });

  // Stage 2: apply feedback adjustments to weights
  if (feedbackHistory.length > 0) {
    strategy = { ...strategy, weights: adjustWeightsFromFeedback(strategy.weights, feedbackHistory) };
  }

  // Stage 2b: GitHub activity snapshots for ranking / must-have gating
  const githubByBuilder = await ensureGithubActivityForBuilders({
    builders,
    limit: Math.min(40, Math.max(limit * 3, 16)),
    persist: persistGithubActivity,
  });
  const githubActivityUsed = [...githubByBuilder.values()].some((snap) => snap.source === 'github_api');

  // Stage 3a: optional semantic similarity — skipped when index retrieval already narrowed the pool.
  let semanticScores = providedSemanticScores || new Map<string, { profileScore: number; projectScore: number }>();
  const shouldRunSemantic =
    !skipSemanticScoring &&
    !providedSemanticScores &&
    isTalentSemanticScoringEnabled() &&
    builders.length > 0 &&
    // Cost is a fixed vector query, not per-builder, so this ceiling only needs
    // to stay above the retrieval pool target.
    builders.length <= 250;

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
  const sponsorshipInferences: SponsorshipInference[] = [];

  for (const builder of builders) {
    const builderId = String(builder._id);
    const projects = projectsByBuilder.get(builderId) ?? [];
    const sponsorship = inferSponsorshipNeed(builder);
    sponsorshipInferences.push(sponsorship);

    if (shouldHardExcludeForSponsorship(sponsorship, jobDoesNotSponsor)) {
      continue;
    }
    if (excludeSet.has(builderId)) {
      continue;
    }

    const githubActivity = githubByBuilder.get(builderId) || null;
    const baseDimensions = getPlanEvidenceDimensions(opportunity?.searchPlan);
    // Keep domain_depth vocabulary in sync with the evidence dossier: expand
    // from plan anchors via domain packs so prose forms (rover, drone, SOC,
    // pentest, …) score on the dimension the same way they prove role fit.
    const roleAnchors = (opportunity?.searchPlan?.roleEvidence?.anchorConcepts || []).map(String);
    const dimensionsForScoring = baseDimensions.map((dimension) => {
      if (dimension.id !== 'domain_depth' || !roleAnchors.length) return dimension;
      const expanded = expandDomainProofTerms(
        [...roleAnchors, ...(dimension.matchAnyOf || [])],
        roleAnchors
      );
      const merged = Array.from(
        new Set([...(dimension.matchAnyOf || []), ...expanded].map((t) => String(t || '').trim()).filter(Boolean))
      ).slice(0, 48);
      return { ...dimension, matchAnyOf: merged };
    });
    const roleDimensionScore = scoreRoleDimensions({
      dimensions: dimensionsForScoring,
      builder,
      projects,
    });

    let components = scoreBuilderFromProfile({
      builder,
      projects,
      opportunity,
      mustHaveSignals: strategy.mustHaveSignals,
      proofSignals: strategy.proofSignals,
      roleSkillTiers: strategy.roleSkillTiers,
      hasUploadedAgentTrace: Boolean(wrappedByBuilder.get(builderId)),
      agentWrappedScore: wrappedByBuilder.get(builderId)?.score ?? null,
      githubActivity,
      sponsorship,
      roleDimensionScore,
    });

    const githubActivityScore =
      githubActivity?.source === 'github_api' ? githubActivity.score : null;
    const requirementFindings = buildRequirementFindings(opportunity, builder, projects, {
      githubActivityScore,
    });
    const roleEvidence = opportunity?.searchPlan?.roleEvidence;
    const requireInternship = opportunityRequiresInternship(opportunity);
    const evidenceDossier = buildRoleEvidenceDossier({
      builder,
      projects,
      roleEvidence,
      requireInternship,
    });
    // Evidence-dossier algorithm replaces skill-bag / title-phrase checks when a
    // roleEvidence plan exists. Keep the legacy evaluator only as a fallback.
    if (evidenceDossier) {
      if (!evidenceDossier.hasRoleProof) continue;
      if (requireInternship && !evidenceDossier.hasInternshipProof) continue;
    } else if (roleEvidence?.anchorConcepts?.length) {
      const roleEvidenceFinding = evaluateRoleEvidence(builder, projects, roleEvidence);
      if (roleEvidenceFinding?.met === 'no') continue;
    }
    const mustHaveGate = evaluateMustHaveGate(opportunity, requirementFindings);
    components = applyMustHavePenalties(components, mustHaveGate);

    // Inject semantic scores if available
    const sem = semanticScores.get(builderId);
    if (sem) {
      components.semanticRoleFit = sem.profileScore;
      components.semanticProjectFit = sem.projectScore;
    }

    let overallFit = computeOverallFit(components, strategy.weights);
    const roleFamily = String(opportunity?.searchPlan?.roleFamily || '');
    const domainHit = roleDimensionScore?.hits?.find((hit) => hit.id === 'domain_depth');
    const domainDepthScore = domainHit?.score ?? 0;
    const domainIsWinning = Boolean(
      roleDimensionScore?.winningHits?.some((hit) => hit.id === 'domain_depth') ||
        (domainHit && domainHit.score >= 0.35 && (domainHit.weight || 0) >= 0.2)
    );
    const specialistRole = roleFamily === 'specialist' || domainIsWinning;

    // Soft-cap stack/ship when domain proof is empty on specialist JDs so
    // generalist shippers cannot outrank empty-domain profiles.
    if (specialistRole && domainDepthScore < 0.12 && !evidenceDossier?.hasRoleProof) {
      components = {
        ...components,
        deterministicSkillFit: Math.min(components.deterministicSkillFit, 0.28),
        startupReadiness: Math.min(components.startupReadiness, 0.25),
        proofStrength: Math.min(components.proofStrength, 0.35),
      };
      overallFit = computeOverallFit(components, strategy.weights);
    }

    // Blend dossier evidence into the ranking score so domain proof outranks
    // generic stack projects even when skill-bag fit looks similar.
    if (evidenceDossier) {
      const dossierWeight = specialistRole ? 0.7 : 0.65;
      overallFit = Math.min(1, overallFit * (1 - dossierWeight) + evidenceDossier.evidenceFit * dossierWeight);
    } else if (roleDimensionScore) {
      // Specialist / domain-winning roles lean harder on dimension evidence.
      const dimWeight = specialistRole ? 0.6 : 0.45;
      overallFit = Math.min(1, overallFit * (1 - dimWeight) + roleDimensionScore.overall * dimWeight);
    }
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
      githubActivity,
      sponsorship,
      roleDimensionScore,
    });
    const hasStrongDimensionWhy = Boolean(
      roleDimensionScore?.winningHits?.some((hit) => hit.score >= 0.35)
    );
    if (!hasStrongDimensionWhy && evidenceDossier?.whyTheyMatch) {
      explanation.whyTheyMatch = evidenceDossier.whyTheyMatch;
    }

    const sources: string[] = ['deterministic_keyword'];
    if (evidenceDossier) sources.push('evidence_dossier');
    if (roleDimensionScore) sources.push('role_dimensions');
    if (sem?.profileScore && sem.profileScore > 0.3) sources.push('semantic_profile');
    if (sem?.projectScore && sem.projectScore > 0.3) sources.push('semantic_project');
    if (wrappedByBuilder.has(builderId)) sources.push('agent_trace');
    if (githubActivity?.source === 'github_api') sources.push('github_activity');

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
      sponsorship,
      githubActivity,
      evidenceDossier,
      roleDimensionScore,
    });
  }

  // Stage 4: must-passers first, then evidence dossier / role dimensions, then overallFit.
  allScored.sort((a, b) => {
    if (a.mustHaveGate.passesMustGate !== b.mustHaveGate.passesMustGate) {
      return a.mustHaveGate.passesMustGate ? -1 : 1;
    }
    const aEvidence = a.evidenceDossier?.evidenceFit ?? a.roleDimensionScore?.overall ?? 0;
    const bEvidence = b.evidenceDossier?.evidenceFit ?? b.roleDimensionScore?.overall ?? 0;
    if (aEvidence !== bEvidence) return bEvidence - aEvidence;
    return b.overallFit - a.overallFit;
  });

  // Stage 5: reasoning review over the qualified cohort, not only visible top cards.
  let finalCandidates: RankedCandidate[];
  let reasoningCohortCount = 0;
  if (enableLlmRerank && generateReply) {
    const builderMap = new Map(allScored.map((c) => [c.builderId, { builder: c.builder, projects: c.projects }]));
    const reasoningCohort = allScored
      .filter((candidate) => candidate.mustHaveGate.passesMustGate)
      .slice(0, 35);
    reasoningCohortCount = reasoningCohort.length;
    const reranked = await rerankTopCandidates({
      candidates: reasoningCohort,
      opportunity,
      builderMap,
      generateReply,
      limit: 35,
    });
    const rerankedById = new Map(reranked.map((candidate) => [candidate.builderId, candidate]));
    // Apply LLM adjustment on top of the already dossier-blended overallFit.
    // Recomputing from components alone would drop the domain evidence blend.
    finalCandidates = allScored.map((original) => {
      const candidate = (rerankedById.get(original.builderId) as RankedCandidate | undefined) || original;
      const adj = Math.max(-0.25, Math.min(0.25, candidate.components.llmRerankAdjustment || 0));
      const components = { ...candidate.components, llmRerankAdjustment: adj };
      let overallFit = Math.max(0, Math.min(1, original.overallFit + adj));
      overallFit = capOverallFitForMustGate(overallFit, candidate.mustHaveGate);
      return {
        ...candidate,
        components,
        overallFit,
        matchLabel: scoreMatchLabel(overallFit),
        explanation: candidate.explanation || original.explanation,
      };
    });
  } else {
    finalCandidates = allScored;
  }

  finalCandidates.sort((a, b) => {
    if (a.mustHaveGate.passesMustGate !== b.mustHaveGate.passesMustGate) {
      return a.mustHaveGate.passesMustGate ? -1 : 1;
    }
    // After LLM rerank, overallFit already includes domain blend + judgment.
    // Prefer it so qualitative domain wins can reorder the shortlist.
    if (enableLlmRerank && generateReply) {
      if (a.overallFit !== b.overallFit) return b.overallFit - a.overallFit;
      const aEvidence = a.evidenceDossier?.evidenceFit ?? a.roleDimensionScore?.overall ?? 0;
      const bEvidence = b.evidenceDossier?.evidenceFit ?? b.roleDimensionScore?.overall ?? 0;
      return bEvidence - aEvidence;
    }
    const aEvidence = a.evidenceDossier?.evidenceFit ?? a.roleDimensionScore?.overall ?? 0;
    const bEvidence = b.evidenceDossier?.evidenceFit ?? b.roleDimensionScore?.overall ?? 0;
    if (aEvidence !== bEvidence) return bEvidence - aEvidence;
    return b.overallFit - a.overallFit;
  });

  const tiers = strategy.roleSkillTiers;
  const primaryMatched = finalCandidates.filter((candidate) =>
    candidate.evidenceDossier
      ? candidate.evidenceDossier.hasRoleProof
      : builderHasPrimaryDomainMatch(tiers, candidate.builder, candidate.projects)
  );
  const primaryFallback = finalCandidates.filter(
    (candidate) =>
      !(candidate.evidenceDossier
        ? candidate.evidenceDossier.hasRoleProof
        : builderHasPrimaryDomainMatch(tiers, candidate.builder, candidate.projects))
  );
  const rankedForReturn =
    tiers.requiresPrimaryMatch && primaryMatched.length > 0
      ? [...primaryMatched, ...primaryFallback]
      : finalCandidates;

  const diversified =
    rankedForReturn.some((candidate) => candidate.evidenceDossier)
      ? rankedForReturn
      : diversifyCloseScores(rankedForReturn, limit);

  // Only return builders who actually clear must-haves and show relevant role
  // evidence. Never pad the shortlist with "closest" weak mismatches.
  const relevantCandidates = filterRelevantCandidates(diversified);
  const noRelevantMatches = relevantCandidates.length === 0;
  const returnedCandidates = noRelevantMatches ? [] : relevantCandidates.slice(0, limit);

  // Stage 6: search quality report for the shortlist founders actually see
  const searchQuality = buildSearchQualityReport({
    totalScanned: builders.length,
    scored: returnedCandidates,
    scoredBeforeRelevanceFilter: diversified,
    opportunity,
    searchMode,
    noRelevantMatches,
  });

  const sponsorshipCoverage = jobDoesNotSponsor
    ? summarizeSponsorshipCoverage(returnedCandidates.map((c) => c.sponsorship || inferSponsorshipNeed(c.builder)))
    : undefined;

  return {
    opportunityId: oppId,
    searchStrategy: strategy,
    candidates: returnedCandidates,
    searchQuality,
    totalScanned: builders.length,
    generatedAt: new Date(),
    sponsorshipCoverage,
    githubActivityUsed,
    reasoningCohortCount,
    noRelevantMatches,
  };
}

/** Prefer diversity across companies/schools when overall fit is within ~3%. */
function diversifyCloseScores(candidates: RankedCandidate[], limit: number): RankedCandidate[] {
  if (candidates.length <= 2) return candidates;
  const selected: RankedCandidate[] = [];
  const usedCompanies = new Set<string>();
  const usedSchools = new Set<string>();
  const remaining = [...candidates];

  while (selected.length < limit && remaining.length) {
    const topFit = remaining[0].overallFit;
    let pickIndex = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      if (topFit - candidate.overallFit > 0.03) break;
      const company = primaryCompany(candidate.builder);
      const school = primarySchool(candidate.builder);
      const companyNovel = !company || !usedCompanies.has(company);
      const schoolNovel = !school || !usedSchools.has(school);
      if (companyNovel && schoolNovel && (company || school) && i > 0) {
        pickIndex = i;
        break;
      }
    }
    const [picked] = remaining.splice(pickIndex, 1);
    selected.push(picked);
    const company = primaryCompany(picked.builder);
    const school = primarySchool(picked.builder);
    if (company) usedCompanies.add(company);
    if (school) usedSchools.add(school);
  }

  return selected;
}

/**
 * Drop must-failures and thin "closest" profiles. A relevant builder must pass
 * every must-have and show at least one of: role proof, domain depth, solid
 * skill fit, or Good/Strong label.
 */
function filterRelevantCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
  return candidates.filter((candidate) => {
    if (!candidate.mustHaveGate.passesMustGate) return false;

    const domainScore =
      candidate.roleDimensionScore?.hits?.find((hit) => hit.id === 'domain_depth')?.score || 0;
    const hasDomainProof =
      Boolean(candidate.evidenceDossier?.hasRoleProof) || domainScore >= 0.15;

    if (candidate.matchLabel === 'Strong Match' || candidate.matchLabel === 'Good Match') {
      return true;
    }

    const solidSkills = (candidate.components.deterministicSkillFit || 0) >= 0.45;
    const solidProof = (candidate.components.proofStrength || 0) >= 0.4;

    return hasDomainProof || solidSkills || solidProof;
  });
}

function primaryCompany(builder: any): string | null {
  const experiences = Array.isArray(builder?.experiences) ? builder.experiences : [];
  for (const exp of experiences) {
    const company = String(exp?.company || '')
      .trim()
      .toLowerCase();
    if (!company || /^(full|part)[-\s]?time|internship|contract|independent$/.test(company)) continue;
    return company;
  }
  return null;
}

function primarySchool(builder: any): string | null {
  const education = Array.isArray(builder?.education) ? builder.education : [];
  const school = String(education[0]?.school || builder?.universityOrCompany || '')
    .trim()
    .toLowerCase();
  return school || null;
}

export { buildSearchStrategy, computeDynamicWeights, type SearchStrategy, type SearchMode } from './strategy';
export { buildSearchQualityReport, type SearchQualityReport } from './searchQuality';
export { type ScoredCandidate } from './scoring';
export { type CandidateFeedbackRecord } from './feedback';
