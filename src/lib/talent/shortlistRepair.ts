import mongoose from 'mongoose';
import MatchRecord from '@/models/talent/MatchRecord';
import Shortlist from '@/models/talent/Shortlist';
import { runFounderDiscoveryPipeline } from '@/lib/talent/discovery/index';
import { buildMatchEvidenceFromExplanation } from '@/lib/talent/matchEvidence';
import type { FounderEntitlements } from '@/lib/billing/entitlements';
import {
  searchableBuilderFilter,
} from '@/lib/talent/searchableBuilderPool';
import { retrieveRoleShapedBuilderPool } from '@/lib/talent/roleShapedRetrieval';
import {
  buildRoleSkillTiers,
  collectBuilderSkillTokens,
  matchedSkills,
} from '@/lib/talent/discovery/roleSkillTiers';

function shortlistCandidateFromDiscovery(
  candidate: any,
  opportunityId: string,
  matchByBuilder: Map<string, any>,
  opportunity?: any
) {
  const match = matchByBuilder.get(String(candidate.builderId));
  const roleTiers = opportunity ? buildRoleSkillTiers(opportunity) : null;
  const domainSkillsMatched = roleTiers
    ? matchedSkills(
        roleTiers.primarySkills,
        collectBuilderSkillTokens(candidate.builder, candidate.projects || [])
      ).slice(0, 6)
    : [];
  return {
    builderId: candidate.builderId,
    matchRecordId: match?._id || null,
    matchLabel: candidate.matchLabel,
    matchScore: Math.round(candidate.overallFit * 100),
    topSkills: domainSkillsMatched.length
      ? domainSkillsMatched
      : candidate.builder.rolePreference?.slice(0, 4) || [],
    proofSummary: candidate.explanation.strongestSignals[0] || '',
    whyTheyMatch:
      candidate.explanation.whyTheyMatch || candidate.explanation.strongestSignals.join('; '),
    requirementFindings: candidate.explanation.requirementFindings || [],
  };
}

/**
 * Fast path for page loads: drop dead builder IDs and trim to plan limit.
 * Never runs discovery — that belongs on explicit search/repair only.
 */
export async function pruneInvalidShortlistBuilders(params: {
  shortlist: any;
  opportunity: any;
  entitlements: FounderEntitlements;
  BuilderProfile: any;
}) {
  const profileLimit =
    params.opportunity?.profileLimitApplied ??
    params.shortlist.profileLimitApplied ??
    params.entitlements.profileLimitPerRole;
  if (profileLimit === null || profileLimit === undefined) return params.shortlist;

  const candidateIds = (params.shortlist.candidates || [])
    .map((candidate: any) => String(candidate.builderId))
    .filter((id: string) => mongoose.Types.ObjectId.isValid(id));

  const liveBuilders = candidateIds.length
    ? await params.BuilderProfile.find(
        searchableBuilderFilter({
          _id: { $in: candidateIds.map((id: string) => new mongoose.Types.ObjectId(id)) },
        })
      )
        .select('_id')
        .lean()
    : [];
  const liveIdSet = new Set(liveBuilders.map((builder: any) => String(builder._id)));
  const validCandidates = (params.shortlist.candidates || [])
    .filter((candidate: any) => liveIdSet.has(String(candidate.builderId)))
    .slice(0, profileLimit);

  const unchanged =
    validCandidates.length === (params.shortlist.candidates || []).length &&
    validCandidates.every(
      (candidate: any, index: number) =>
        String(candidate.builderId) === String(params.shortlist.candidates[index]?.builderId)
    );
  if (unchanged) return params.shortlist;

  const repaired = await Shortlist.findOneAndUpdate(
    { _id: params.shortlist._id },
    {
      $set: {
        candidates: validCandidates,
        totalMatches: validCandidates.length,
        strongMatchCount: validCandidates.filter(
          (candidate: any) => candidate.matchLabel === 'Strong Match'
        ).length,
        profileLimitApplied: profileLimit,
      },
    },
    { new: true }
  ).lean();
  return repaired || params.shortlist;
}

/**
 * Replace stale shortlist builder IDs (search-index ghosts) and backfill up to the plan limit.
 * Expensive — only call from search / explicit repair flows, never from role page GET.
 */
export async function repairShortlistMissingBuilders(params: {
  shortlist: any;
  opportunity: any;
  founderEmail: string;
  entitlements: FounderEntitlements;
  BuilderProfile: any;
  ProjectRecord: any;
}) {
  const profileLimit =
    params.opportunity?.profileLimitApplied ??
    params.shortlist.profileLimitApplied ??
    params.entitlements.profileLimitPerRole;
  if (profileLimit === null || profileLimit === undefined) return params.shortlist;

  // Always start with the cheap prune so we never rediscover already-valid cards.
  const pruned = await pruneInvalidShortlistBuilders({
    shortlist: params.shortlist,
    opportunity: params.opportunity,
    entitlements: params.entitlements,
    BuilderProfile: params.BuilderProfile,
  });

  const validCandidates = pruned.candidates || [];
  const needed = profileLimit - validCandidates.length;
  if (needed <= 0) return pruned;

  const liveIdSet = new Set(validCandidates.map((candidate: any) => String(candidate.builderId)));
  const excludeIds = validCandidates.map((candidate: any) => candidate.builderId);
  const { builders, projectsByBuilder } = await retrieveRoleShapedBuilderPool({
    opportunity: params.opportunity,
    founderId: String(params.opportunity.founderId || ''),
    profileLimit,
    BuilderProfile: params.BuilderProfile,
    ProjectRecord: params.ProjectRecord,
    excludeBuilderIds: excludeIds,
    seedBuilders: validCandidates.map((candidate: any) => ({ _id: candidate.builderId })),
  });

  const supplementalBuilders = builders.filter((builder) => !liveIdSet.has(String(builder._id)));
  if (!supplementalBuilders.length) return pruned;

  const opportunityId = String(pruned.opportunityId || params.opportunity._id);
  const discovery = await runFounderDiscoveryPipeline({
    opportunity: params.opportunity,
    founderId: String(params.opportunity.founderId || ''),
    builders: supplementalBuilders,
    projectsByBuilder,
    searchMode: 'balanced',
    limit: needed,
  });

  if (!discovery.candidates.length) return pruned;

  const matchPayloads = discovery.candidates.map((candidate) => ({
    builderId: candidate.builderId,
    opportunityId,
    matchScore: Math.round(candidate.overallFit * 100),
    matchLabel: candidate.matchLabel,
    status: 'generated',
    reasoning:
      candidate.explanation.whyTheyMatch || candidate.explanation.strongestSignals.join('; '),
    requirementFindings: candidate.explanation.requirementFindings || [],
    evidence: buildMatchEvidenceFromExplanation({
      strongestSignals: candidate.explanation.strongestSignals,
      builder: candidate.builder,
      projects: candidate.projects,
    }),
    riskFlags: candidate.explanation.concerns,
  }));

  await MatchRecord.bulkWrite(
    matchPayloads.map((payload) => ({
      updateOne: {
        filter: { builderId: payload.builderId, opportunityId },
        update: { $set: payload },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const builderIds = discovery.candidates.map((candidate) => candidate.builderId);
  const matches = await MatchRecord.find({ opportunityId, builderId: { $in: builderIds } })
    .select('_id builderId')
    .lean();
  const matchByBuilder = new Map(matches.map((match: any) => [String(match.builderId), match]));

  const supplemental = discovery.candidates.map((candidate) =>
    shortlistCandidateFromDiscovery(candidate, opportunityId, matchByBuilder, params.opportunity)
  );
  const merged = [...validCandidates, ...supplemental].slice(0, profileLimit);
  const repaired = await Shortlist.findOneAndUpdate(
    { _id: pruned._id },
    {
      $set: {
        candidates: merged,
        totalMatches: merged.length,
        strongMatchCount: merged.filter((candidate: any) => candidate.matchLabel === 'Strong Match').length,
        profileLimitApplied: profileLimit,
      },
    },
    { new: true }
  ).lean();
  return repaired || pruned;
}
