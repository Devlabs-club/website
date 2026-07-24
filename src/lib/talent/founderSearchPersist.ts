import MatchRecord from '@/models/talent/MatchRecord';
import Shortlist from '@/models/talent/Shortlist';
import type { DiscoveryResult } from '@/lib/talent/discovery/index';
import { buildMatchEvidenceFromExplanation } from '@/lib/talent/matchEvidence';
import { entitlementSnapshot, type FounderEntitlements } from '@/lib/billing/entitlements';
import {
  buildRoleSkillTiers,
  collectBuilderSkillTokens,
  matchedSkills,
} from '@/lib/talent/discovery/roleSkillTiers';

function logFounderSearchPersist(event: string, meta: Record<string, unknown> = {}) {
  console.info(`[founder-search-persist] ${event}`, meta);
}

export async function persistDiscoveryCandidates(params: {
  result: DiscoveryResult;
  opportunityId: string;
  opportunity?: any;
  founderEmail: string;
  unlockShortlist?: boolean;
  entitlements?: FounderEntitlements;
  poolSummary?: Record<string, unknown> | null;
  poolNarrative?: string | null;
}) {
  const {
    result,
    opportunityId,
    opportunity,
    founderEmail,
    unlockShortlist = true,
    entitlements,
    poolSummary = null,
    poolNarrative = null,
  } = params;
  const roleTiers = opportunity ? buildRoleSkillTiers(opportunity) : null;
  const startedAt = Date.now();
  const candidatePayloads = result.candidates.map((candidate) => ({
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

  logFounderSearchPersist('bulk:start', {
    opportunityId,
    candidateCount: candidatePayloads.length,
  });

  if (candidatePayloads.length) {
    await MatchRecord.bulkWrite(
      candidatePayloads.map((payload) => ({
        updateOne: {
          filter: { builderId: payload.builderId, opportunityId },
          update: { $set: payload },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }

  const builderIds = candidatePayloads.map((candidate) => candidate.builderId);
  const matches = builderIds.length
    ? await MatchRecord.find({ opportunityId, builderId: { $in: builderIds } })
        .select('_id builderId')
        .maxTimeMS(10000)
        .lean()
    : [];
  const matchByBuilder = new Map(matches.map((match: any) => [String(match.builderId), match]));

  const candidatesWithIds: Record<string, unknown>[] = result.candidates.map((candidate) => {
    const match = matchByBuilder.get(String(candidate.builderId));
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
      matchScore: Number.isFinite(candidate.overallFit) ? Math.round(candidate.overallFit * 100) : 0,
      topSkills: domainSkillsMatched.length
        ? domainSkillsMatched
        : candidate.builder.rolePreference?.slice(0, 4) || [],
      proofSummary: candidate.explanation.strongestSignals[0] || '',
      whyTheyMatch:
        candidate.explanation.whyTheyMatch ||
        candidate.explanation.strongestSignals.join('; '),
      requirementFindings: candidate.explanation.requirementFindings || [],
    };
  });

  logFounderSearchPersist('bulk:done', {
    opportunityId,
    candidateCount: candidatePayloads.length,
    matchCount: matches.length,
    durationMs: Date.now() - startedAt,
  });

  const shortlistStartedAt = Date.now();
  const shortlistDoc = await Shortlist.findOneAndUpdate(
    { opportunityId },
    {
      $set: {
        opportunityId,
        founderEmail,
        totalMatches: candidatesWithIds.length,
        strongMatchCount: candidatesWithIds.filter((c) => c.matchLabel === 'Strong Match').length,
        visibilityMode: entitlements?.visibilityMode || 'full',
        profileLimitApplied: entitlements?.profileLimitPerRole ?? null,
        traceAccess: entitlements?.traceAccess || 'full',
        introAccess: entitlements?.introAccess || 'enabled',
        upgradeRequiredFor: entitlements?.lifecycleAccess === 'locked'
          ? ['agent_traces', 'intro_requests', 'messages', 'calls', 'trials', 'hiring']
          : [],
        teaserMetadata: entitlements
          ? {
              entitlements: entitlementSnapshot(entitlements),
              sourceBadges: ['Claude Code', 'Codex', 'GitHub', 'Portfolio', 'LinkedIn'],
            }
          : {},
        poolSummary,
        poolNarrative,
        candidates: candidatesWithIds,
        previewGeneratedAt: new Date(),
        ...(unlockShortlist ? { unlocked: true, unlockedAt: new Date() } : {}),
      },
    },
    { upsert: true, new: true }
  ).maxTimeMS(10000);

  logFounderSearchPersist('shortlist:done', {
    opportunityId,
    candidateCount: candidatesWithIds.length,
    durationMs: Date.now() - shortlistStartedAt,
    totalDurationMs: Date.now() - startedAt,
  });

  return { shortlistDoc, candidatesWithIds };
}
