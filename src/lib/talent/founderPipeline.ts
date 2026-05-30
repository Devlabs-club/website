export const PIPELINE_STATUS_ORDER = [
  'shortlisted',
  'intro_requested',
  'builder_interested',
  'interviewing',
  'trial',
  'offer',
  'hired',
  'closed',
] as const;

export type PipelineStatusKey = (typeof PIPELINE_STATUS_ORDER)[number];

export const MATCH_STATUS_TO_PIPELINE: Record<string, PipelineStatusKey> = {
  generated: 'shortlisted',
  approved: 'shortlisted',
  intro_requested: 'intro_requested',
  builder_interested: 'builder_interested',
  interviewing: 'interviewing',
  trial: 'trial',
  offer: 'offer',
  hired: 'hired',
  rejected: 'closed',
  closed: 'closed',
};

export const PIPELINE_TO_MATCH_STATUS: Record<PipelineStatusKey, string> = {
  shortlisted: 'approved',
  intro_requested: 'intro_requested',
  builder_interested: 'builder_interested',
  interviewing: 'interviewing',
  trial: 'trial',
  offer: 'offer',
  hired: 'hired',
  closed: 'closed',
};

export function pipelineStatusLabel(key: PipelineStatusKey): string {
  const labels: Record<PipelineStatusKey, string> = {
    shortlisted: 'Shortlisted',
    intro_requested: 'Intro Requested',
    builder_interested: 'Builder Interested',
    interviewing: 'Interviewing',
    trial: 'Trial',
    offer: 'Offer',
    hired: 'Hired',
    closed: 'Closed',
  };
  return labels[key];
}

export function matchStatusToPipeline(matchStatus: string): PipelineStatusKey {
  return MATCH_STATUS_TO_PIPELINE[matchStatus] || 'shortlisted';
}

export function syncMatchPipelineStatus(match: any, pipelineKey: PipelineStatusKey) {
  match.status = PIPELINE_TO_MATCH_STATUS[pipelineKey];
  match.pipelineNextStep = null;
}

export type PipelineContext = {
  hasIntroRequest?: boolean;
  callScheduleStatus?: string | null;
  trialProjectStatus?: string | null;
  callCompletedAt?: Date | string | null;
};

export function pipelineNextStep(
  pipelineKey: PipelineStatusKey,
  context: PipelineContext = {}
): string {
  const { hasIntroRequest, callScheduleStatus, trialProjectStatus, callCompletedAt } = context;

  switch (pipelineKey) {
    case 'shortlisted':
      return hasIntroRequest ? 'Review intro request' : 'Request intro or review profile';
    case 'intro_requested':
      return 'Awaiting builder response';
    case 'builder_interested':
      return 'Schedule intro call';
    case 'interviewing':
      if (callScheduleStatus === 'pending_builder') return 'Waiting for builder to confirm call time';
      if (callScheduleStatus === 'pending_founder') return 'Confirm builder’s proposed call time';
      if (callScheduleStatus === 'confirmed' && !callCompletedAt) return 'Mark call complete after your intro';
      if (callCompletedAt) return 'Hire now or start a work trial';
      return 'Schedule or confirm intro call';
    case 'trial':
      if (trialProjectStatus === 'sent' || trialProjectStatus === 'in_progress') {
        return 'Awaiting builder trial submission';
      }
      if (trialProjectStatus === 'submitted') return 'Review trial submission';
      if (trialProjectStatus === 'rejected') return 'Revise trial or reject candidate';
      return 'Send trial project to builder';
    case 'offer':
      return 'Hire now or extend formal offer';
    case 'hired':
      return 'Onboarding and kickoff';
    case 'closed':
      return 'No further action';
    default:
      return 'Review candidate';
  }
}

export function buildSuggestedIntroMessage(params: {
  founderName: string;
  builderName: string;
  opportunity: {
    company?: string | null;
    roleTitle?: string | null;
    startupSummary?: string | null;
    builderWillDo?: string | null;
    successIn30Days?: string | null;
    skillsNeeded?: string[];
    timeline?: string | null;
  };
  matchReasoning?: string | null;
  topSkills?: string[];
  projectHighlight?: string | null;
}): string {
  const founder = params.founderName.split(' ')[0] || 'the founder';
  const builder = params.builderName.split(' ')[0] || 'there';
  const startup = params.opportunity.company || 'our startup';
  const role = params.opportunity.roleTitle || 'a builder role';
  const timeline = params.opportunity.timeline ? ` (${params.opportunity.timeline})` : '';

  const jobFocus =
    params.opportunity.builderWillDo ||
    params.opportunity.successIn30Days ||
    params.opportunity.startupSummary?.split('.')[0]?.trim() ||
    null;

  const skillsLine = params.opportunity.skillsNeeded?.length
    ? `We're looking for ${params.opportunity.skillsNeeded.slice(0, 4).join(', ')}. `
    : '';

  let proofBit = '';
  if (params.projectHighlight) {
    proofBit = `Your work on ${params.projectHighlight}`;
  } else if (params.topSkills?.length) {
    proofBit = `Your experience with ${params.topSkills.slice(0, 3).join(', ')}`;
  } else if (params.matchReasoning) {
    const snippet = params.matchReasoning.split('.')[0]?.trim();
    if (snippet) proofBit = snippet;
  }
  if (!proofBit) proofBit = 'Your proof-of-work on DevLabs';

  const roleDesc = jobFocus ? `The role focuses on: ${jobFocus}. ` : '';

  return `Hey ${builder}, I'm ${founder} at ${startup}. We're hiring a ${role}${timeline}. ${roleDesc}${skillsLine}${proofBit} looks like a strong fit for what we need. Would you be open to a quick intro to discuss the role?`;
}

export async function buildFounderPipeline(
  founderEmail: string,
  deps: {
    Opportunity: any;
    Shortlist: any;
    MatchRecord: any;
    BuilderProfile: any;
    IntroRequest: any;
    CallSchedule?: any;
  }
) {
  const opportunities = await deps.Opportunity.find({ founderEmail }).lean();
  const oppIds = opportunities.map((o: any) => o._id);
  const oppById = new Map(opportunities.map((o: any) => [String(o._id), o]));

  const shortlists = await deps.Shortlist.find({
    opportunityId: { $in: oppIds },
    unlocked: true,
  }).lean();

  const unlockedOppIds = new Set(shortlists.map((s: any) => String(s.opportunityId)));
  const hiddenByOpp = new Map<string, Set<string>>();
  const candidateIdsByOpp = new Map<string, Set<string>>();

  for (const sl of shortlists) {
    const oppId = String(sl.opportunityId);
    hiddenByOpp.set(oppId, new Set((sl.hiddenBuilderIds || []).map(String)));
    candidateIdsByOpp.set(
      oppId,
      new Set((sl.candidates || []).map((c: any) => String(c.builderId)))
    );
  }

  const matches = await deps.MatchRecord.find({
    opportunityId: { $in: Array.from(unlockedOppIds) },
  }).lean();

  const builderIds = [...new Set(matches.map((m: any) => String(m.builderId)))];
  const builders = await deps.BuilderProfile.find({ _id: { $in: builderIds } })
    .select('name headline email')
    .lean();
  const builderById = new Map(builders.map((b: any) => [String(b._id), b]));

  const intros = await deps.IntroRequest.find({
    opportunityId: { $in: Array.from(unlockedOppIds) },
  }).lean();
  const introByKey = new Map(
    intros.map((i: any) => [`${i.opportunityId}:${i.builderId}`, i])
  );

  let callByKey = new Map<string, any>();
  if (deps.CallSchedule) {
    const calls = await deps.CallSchedule.find({
      opportunityId: { $in: Array.from(unlockedOppIds) },
    }).lean();
    callByKey = new Map(calls.map((c: any) => [`${c.opportunityId}:${c.builderId}`, c]));
  }

  const entries: ReturnType<typeof buildPipelineEntry>[] = [];

  for (const match of matches) {
    const oppId = String(match.opportunityId);
    if (!unlockedOppIds.has(oppId)) continue;

    const allowed = candidateIdsByOpp.get(oppId);
    const builderId = String(match.builderId);
    if (allowed && !allowed.has(builderId)) continue;
    if (hiddenByOpp.get(oppId)?.has(builderId)) continue;

    const intro = introByKey.get(`${oppId}:${builderId}`) || null;
    const callSchedule = callByKey.get(`${oppId}:${builderId}`) || null;

    const builder = builderById.get(builderId);
    const opportunity = oppById.get(oppId);
    if (!builder || !opportunity) continue;

    entries.push(
      buildPipelineEntry({ match, builder, opportunity, introRequest: intro, callSchedule })
    );
  }

  entries.sort((a, b) => {
    const ai = PIPELINE_STATUS_ORDER.indexOf(a.status as PipelineStatusKey);
    const bi = PIPELINE_STATUS_ORDER.indexOf(b.status as PipelineStatusKey);
    if (ai !== bi) return ai - bi;
    return (b.matchScore || 0) - (a.matchScore || 0);
  });

  const grouped: Record<PipelineStatusKey, typeof entries> = {
    shortlisted: [],
    intro_requested: [],
    builder_interested: [],
    interviewing: [],
    trial: [],
    offer: [],
    hired: [],
    closed: [],
  };

  for (const entry of entries) {
    grouped[entry.status as PipelineStatusKey].push(entry);
  }

  return { entries, grouped };
}

export function buildPipelineEntry(params: {
  match: any;
  builder: any;
  opportunity: any;
  introRequest: any | null;
  callSchedule?: any | null;
}) {
  const { match, builder, opportunity, introRequest, callSchedule } = params;
  const pipelineKey = matchStatusToPipeline(match.status || 'generated');

  return {
    matchRecordId: String(match._id),
    builderId: String(builder._id),
    opportunityId: String(opportunity._id),
    candidateName: builder.name,
    roleTitle: opportunity.roleTitle,
    company: opportunity.company,
    matchScore: match.matchScore,
    matchLabel: match.matchLabel,
    status: pipelineKey,
    statusLabel: pipelineStatusLabel(pipelineKey),
    matchStatus: match.status,
    nextStep: pipelineNextStep(pipelineKey, {
      hasIntroRequest: Boolean(introRequest),
      callScheduleStatus: callSchedule?.status || null,
      trialProjectStatus: match.trialProject?.status || null,
      callCompletedAt: match.callCompletedAt || callSchedule?.callCompletedAt || null,
    }),
    introRequestId: introRequest?._id ? String(introRequest._id) : null,
    introRequestStatus: introRequest?.status || null,
    introMessage: introRequest?.introMessage || null,
    introRequestedAt: introRequest?.createdAt || null,
    trialProjectStatus: match.trialProject?.status || null,
    callCompletedAt: match.callCompletedAt || null,
    callScheduleStatus: callSchedule?.status || null,
    callScheduleId: callSchedule?._id ? String(callSchedule._id) : null,
    confirmedCallStartAt: callSchedule?.confirmedSlot?.startAt
      ? new Date(callSchedule.confirmedSlot.startAt).toISOString()
      : null,
    confirmedCallEndAt: callSchedule?.confirmedSlot?.endAt
      ? new Date(callSchedule.confirmedSlot.endAt).toISOString()
      : null,
    updatedAt: match.updatedAt || match.createdAt,
  };
}
