import MatchRecord from '@/models/talent/MatchRecord';
import Shortlist from '@/models/talent/Shortlist';
import type { DiscoveryResult } from '@/lib/talent/discovery/index';
import { buildMatchEvidenceFromExplanation } from '@/lib/talent/matchEvidence';

export async function persistDiscoveryCandidates(params: {
  result: DiscoveryResult;
  opportunityId: string;
  founderEmail: string;
  unlockShortlist?: boolean;
}) {
  const { result, opportunityId, founderEmail, unlockShortlist = true } = params;
  const candidatesWithIds: Record<string, unknown>[] = [];

  for (const candidate of result.candidates) {
    const match = await MatchRecord.findOneAndUpdate(
      { builderId: candidate.builderId, opportunityId },
      {
        $set: {
          builderId: candidate.builderId,
          opportunityId,
          matchScore: Math.round(candidate.overallFit * 100),
          matchLabel: candidate.matchLabel,
          status: 'generated',
          reasoning: candidate.explanation.strongestSignals.join('; '),
          evidence: buildMatchEvidenceFromExplanation({
            strongestSignals: candidate.explanation.strongestSignals,
            builder: candidate.builder,
            projects: candidate.projects,
          }),
          riskFlags: candidate.explanation.concerns,
        },
      },
      { upsert: true, new: true }
    );

    candidatesWithIds.push({
      builderId: candidate.builderId,
      matchRecordId: match._id,
      matchLabel: candidate.matchLabel,
      matchScore: Math.round(candidate.overallFit * 100),
      topSkills: candidate.builder.rolePreference?.slice(0, 4) || [],
      proofSummary: candidate.explanation.strongestSignals[0] || '',
      whyTheyMatch: candidate.explanation.strongestSignals.join('; '),
    });
  }

  const shortlistDoc = await Shortlist.findOneAndUpdate(
    { opportunityId },
    {
      $set: {
        opportunityId,
        founderEmail,
        totalMatches: candidatesWithIds.length,
        strongMatchCount: candidatesWithIds.filter((c) => c.matchLabel === 'Strong Match').length,
        candidates: candidatesWithIds,
        previewGeneratedAt: new Date(),
        ...(unlockShortlist ? { unlocked: true, unlockedAt: new Date() } : {}),
      },
    },
    { upsert: true, new: true }
  );

  return { shortlistDoc, candidatesWithIds };
}
