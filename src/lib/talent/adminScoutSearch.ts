import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import MatchRecord from '@/models/talent/MatchRecord';
import Shortlist from '@/models/talent/Shortlist';
import Opportunity from '@/models/talent/Opportunity';
import { generateOpenRouterReply } from '@/lib/openrouter';
import { runFounderDiscoveryPipeline } from '@/lib/talent/discovery/index';
import type { SearchMode } from '@/lib/talent/discovery/strategy';
import { canRunPreviewAnyway } from '@/lib/talent/founderSearchQuality';
import { buildAdminCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import { persistDiscoveryCandidates } from '@/lib/talent/founderSearchPersist';
import type { AgentSearchQualityBlock } from '@/lib/agent/uiBlocks';

export type AdminScoutSearchResult = {
  opportunity: Record<string, unknown>;
  shortlist: {
    totalMatches: number;
    strongMatchCount: number;
    candidates: Awaited<ReturnType<typeof buildAdminCandidatesForShortlist>>;
  };
  searchQuality: AgentSearchQualityBlock;
  message: string;
};

export async function runAdminScoutSearch(params: {
  opportunityId: string;
  founderEmail: string;
  founderId: string;
  searchMode?: SearchMode;
}): Promise<AdminScoutSearchResult> {
  const { opportunityId, founderEmail, founderId, searchMode = 'balanced' } = params;

  const opportunity = await Opportunity.findOne({ _id: opportunityId, founderEmail });
  if (!opportunity) throw new Error('Search not found');

  const oppPlain = opportunity.toObject ? opportunity.toObject() : opportunity;
  if (!canRunPreviewAnyway(oppPlain)) {
    throw new Error(
      'Add at least a role title, what they will build, and required skills before running search.'
    );
  }

  const builders = await BuilderProfile.find({
    verificationStatus: { $ne: 'rejected' },
    visibilityStatus: { $ne: 'hidden' },
  })
    .limit(2000)
    .lean();

  const builderIds = builders.map((b: { _id: unknown }) => b._id);
  const allProjects = await ProjectRecord.find({ builderId: { $in: builderIds } })
    .select(
      'builderId projectName description problemSolved techStack builderContribution contributionTags verificationStatus links'
    )
    .lean();

  const projectsByBuilder = new Map<string, unknown[]>();
  for (const project of allProjects) {
    const key = String(project.builderId);
    if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
    projectsByBuilder.get(key)!.push(project);
  }

  const result = await runFounderDiscoveryPipeline({
    opportunity: oppPlain,
    founderId,
    builders,
    projectsByBuilder,
    searchMode,
    feedbackHistory: [],
    enableLlmRerank: true,
    generateReply: (sys, usr) =>
      generateOpenRouterReply({ systemPrompt: sys, userPrompt: usr, temperature: 0, maxTokens: 400 }),
    limit: 12,
  });

  const { shortlistDoc } = await persistDiscoveryCandidates({
    result,
    opportunityId,
    founderEmail,
  });

  opportunity.status = 'shortlisted';
  await opportunity.save();

  const fullCandidates = await buildAdminCandidatesForShortlist(shortlistDoc, oppPlain, {
    BuilderProfile,
    ProjectRecord,
    MatchRecord,
  });

  const searchQuality: AgentSearchQualityBlock = {
    type: 'search_quality_report',
    totalScanned: result.searchQuality.totalCandidatesScanned,
    totalRetrieved: result.searchQuality.totalCandidatesRetrieved,
    strongCount: result.searchQuality.strongCandidates,
    mediumCount: result.searchQuality.mediumCandidates,
    weakCount: result.searchQuality.weakCandidates,
    poolStrength: result.searchQuality.poolStrength,
    confidence: result.searchQuality.confidence,
    bottlenecks: result.searchQuality.bottlenecks,
    suggestedRelaxations: result.searchQuality.suggestedRelaxations,
    suggestedNextAction:
      result.searchQuality.suggestedRelaxations[0] || 'Review candidates in the results panel.',
  };

  const total = fullCandidates.length;
  const strong = result.searchQuality.strongCandidates;
  const message =
    total > 0
      ? `Found ${total} builder${total === 1 ? '' : 's'}${strong > 0 ? ` (${strong} strong match${strong === 1 ? '' : 'es'})` : ''}. Results are in the panel on the right.`
      : 'Search complete. No strong matches yet — try widening skills or adjusting the stack.';

  return {
    opportunity: oppPlain,
    shortlist: {
      totalMatches: fullCandidates.length,
      strongMatchCount: fullCandidates.filter((c) => c.matchLabel === 'Strong Match').length,
      candidates: fullCandidates,
    },
    searchQuality,
    message,
  };
}
