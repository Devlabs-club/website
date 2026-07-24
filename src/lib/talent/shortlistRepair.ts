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
 * Replace stale shortlist builder IDs (search-index ghosts) and backfill up to the plan limit.
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

  const candidateIds = (params.shortlist.candidates || [])
    .map((candidate: any) => String(candidate.builderId))
    .filter((id: string) => mongoose.Types.ObjectId.isValid(id));

  const liveBuilders = candidateIds.length
    ? await params.BuilderProfile.find(searchableBuilderFilter({
        _id: { $in: candidateIds.map((id: string) => new mongoose.Types.ObjectId(id)) },
      }))
      .select('_id')
      .lean()
    : [];
  const liveIdSet = new Set(liveBuilders.map((builder: any) => String(builder._id)));
  const validCandidates = (params.shortlist.candidates || []).filter((candidate: any) =>
    liveIdSet.has(String(candidate.builderId))
  );

  if (validCandidates.length > profileLimit) {
    const trimmed = validCandidates.slice(0, profileLimit);
    const repaired = await Shortlist.findOneAndUpdate(
      { _id: params.shortlist._id },
      {
        $set: {
          candidates: trimmed,
          totalMatches: trimmed.length,
          strongMatchCount: trimmed.filter((candidate: any) => candidate.matchLabel === 'Strong Match').length,
          profileLimitApplied: profileLimit,
        },
      },
      { new: true }
    ).lean();
    return repaired || params.shortlist;
  }

  const needed = profileLimit - validCandidates.length;
  if (needed <= 0 && validCandidates.length === (params.shortlist.candidates || []).length) {
    return params.shortlist;
  }

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
  if (!supplementalBuilders.length) {
    if (validCandidates.length !== (params.shortlist.candidates || []).length) {
      const repaired = await Shortlist.findOneAndUpdate(
        { _id: params.shortlist._id },
        {
          $set: {
            candidates: validCandidates.slice(0, profileLimit),
            totalMatches: Math.min(validCandidates.length, profileLimit),
            strongMatchCount: validCandidates.filter((candidate: any) => candidate.matchLabel === 'Strong Match').length,
          },
        },
        { new: true }
      ).lean();
      return repaired || params.shortlist;
    }
    return params.shortlist;
  }

  const opportunityId = String(params.shortlist.opportunityId || params.opportunity._id);
  const discovery = await runFounderDiscoveryPipeline({
    opportunity: params.opportunity,
    founderId: String(params.opportunity.founderId || ''),
    builders: supplementalBuilders,
    projectsByBuilder,
    searchMode: 'balanced',
    limit: needed,
  });

  if (!discovery.candidates.length) {
    const repaired = await Shortlist.findOneAndUpdate(
      { _id: params.shortlist._id },
      {
        $set: {
          candidates: validCandidates.slice(0, profileLimit),
          totalMatches: Math.min(validCandidates.length, profileLimit),
          strongMatchCount: validCandidates.filter((candidate: any) => candidate.matchLabel === 'Strong Match').length,
        },
      },
      { new: true }
    ).lean();
    return repaired || params.shortlist;
  }

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
  const backfillCandidates = discovery.candidates.map((candidate) =>
    shortlistCandidateFromDiscovery(candidate, opportunityId, matchByBuilder, params.opportunity)
  );

  const mergedCandidates = [...validCandidates, ...backfillCandidates]
    .filter((candidate, index, list) =>
      list.findIndex((entry) => String(entry.builderId) === String(candidate.builderId)) === index
    )
    .slice(0, profileLimit);

  const repaired = await Shortlist.findOneAndUpdate(
    { _id: params.shortlist._id },
    {
      $set: {
        candidates: mergedCandidates,
        totalMatches: mergedCandidates.length,
        strongMatchCount: mergedCandidates.filter((candidate) => candidate.matchLabel === 'Strong Match').length,
        profileLimitApplied: profileLimit,
      },
    },
    { new: true }
  ).lean();

  return repaired || params.shortlist;
}
