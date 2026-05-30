import MatchRecord from '@/models/talent/MatchRecord';
import Opportunity from '@/models/talent/Opportunity';
import BuilderProfile from '@/models/talent/BuilderProfile';
import Shortlist from '@/models/talent/Shortlist';
import {
  builderDashboardLink,
  createNotification,
  founderDashboardLink,
} from '@/lib/talent/notifications';
import { syncMatchPipelineStatus } from '@/lib/talent/founderPipeline';
import { mapTrialProjectFromMatch, normalizeTrialProject } from '@/lib/talent/founderTrialProject';

async function loadFounderMatch(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
}) {
  const shortlist = await Shortlist.findOne({
    opportunityId: params.opportunityId,
    founderEmail: params.founderEmail,
  });
  if (!shortlist?.unlocked) return { error: 'Unlock the shortlist first.', status: 403 as const };

  const [opportunity, builder, match] = await Promise.all([
    Opportunity.findOne({ _id: params.opportunityId, founderEmail: params.founderEmail }),
    BuilderProfile.findById(params.builderId).lean(),
    MatchRecord.findOne({ opportunityId: params.opportunityId, builderId: params.builderId }),
  ]);

  if (!opportunity || !builder || !match) {
    return { error: 'Match or candidate not found', status: 404 as const };
  }

  return { shortlist, opportunity, builder, match };
}

export async function sendTrialProjectToBuilder(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  deadlineAt: Date;
}) {
  const ctx = await loadFounderMatch(params);
  if ('error' in ctx) return ctx;

  const { opportunity, builder, match } = ctx;

  // RESTORE BEFORE GIT PUSH — intro call required before sending trial
  // if (!match.callCompletedAt) {
  //   return { error: 'Complete the intro call before sending a trial project.', status: 400 as const };
  // }

  const existingStatus = match.trialProject?.status;
  if (existingStatus && !['draft', 'rejected'].includes(existingStatus)) {
    return { error: 'A trial has already been sent for this builder.', status: 400 as const };
  }

  const draft = normalizeTrialProject(match.trialProject);
  if (!draft) {
    return { error: 'Generate and save a trial project draft first.', status: 400 as const };
  }

  match.trialProject = {
    ...match.trialProject,
    ...draft,
    deadlineAt: params.deadlineAt,
    status: 'sent',
    sentAt: new Date(),
    updatedAt: new Date(),
  };
  syncMatchPipelineStatus(match, 'trial');
  await match.save();

  await createNotification({
    recipientType: 'builder',
    recipientEmail: builder.email,
    builderId: String(builder._id),
    type: 'trial_sent',
    title: 'New trial project',
    body: `You received a trial project: ${draft.title}`,
    link: builderDashboardLink('trials', { matchId: String(match._id) }),
    entityType: 'MatchRecord',
    entityId: String(match._id),
  });

  return {
    trialProject: mapTrialProjectFromMatch(match.trialProject),
    matchStatus: match.status,
  };
}

export async function submitTrialByBuilder(params: {
  opportunityId: string;
  builderId: string;
  videoUrl: string;
  githubUrl: string;
  notes?: string;
}) {
  const match = await MatchRecord.findOne({
    opportunityId: params.opportunityId,
    builderId: params.builderId,
  });
  if (!match) return { error: 'Trial not found', status: 404 as const };

  if (!match.trialProject || !['sent', 'in_progress', 'rejected'].includes(match.trialProject.status)) {
    return { error: 'No active trial project to submit', status: 400 as const };
  }

  const videoUrl = params.videoUrl.trim();
  const githubUrl = params.githubUrl.trim();
  if (!videoUrl || !githubUrl) {
    return { error: 'GitHub URL and walkthrough video link (Google Drive) are required', status: 400 as const };
  }

  const now = new Date();
  match.trialProject.status = 'submitted';
  match.trialProject.submittedAt = now;
  match.trialProject.submission = {
    videoUrl,
    githubUrl,
    notes: params.notes?.trim() || null,
    submittedAt: now,
  };
  await match.save();

  const opportunity = await Opportunity.findById(params.opportunityId).lean();
  const builder = await BuilderProfile.findById(params.builderId).lean();

  if (opportunity?.founderEmail) {
    await createNotification({
      recipientType: 'founder',
      recipientEmail: opportunity.founderEmail,
      type: 'trial_submitted',
      title: 'Trial submitted',
      body: `${builder?.name || 'Builder'} submitted their trial for ${opportunity.roleTitle || 'your role'}.`,
      link: founderDashboardLink({
        builderId: params.builderId,
        opportunityId: params.opportunityId,
      }),
      entityType: 'MatchRecord',
      entityId: String(match._id),
    });
  }

  return {
    trialProject: mapTrialProjectFromMatch(match.trialProject),
    matchStatus: match.status,
  };
}

export async function reviewTrialSubmission(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  decision: 'approve' | 'reject';
  note?: string;
}) {
  const ctx = await loadFounderMatch(params);
  if ('error' in ctx) return ctx;

  const { builder, match } = ctx;

  if (!match.trialProject || match.trialProject.status !== 'submitted') {
    return { error: 'No submitted trial to review', status: 400 as const };
  }

  if (params.decision === 'reject') {
    const rejectionCount = match.trialProject.rejectionCount || 0;
    const note = params.note?.trim() || '';
    if (rejectionCount >= 2 && note.length < 20) {
      return {
        error: 'Please provide a rejection note of at least 20 characters.',
        status: 400 as const,
      };
    }

    match.trialProject.status = 'rejected';
    match.trialProject.rejectionCount = rejectionCount + 1;
    if (note) {
      match.trialProject.rejectionNotes = [
        ...(match.trialProject.rejectionNotes || []),
        { note, rejectedAt: new Date() },
      ];
    }
    match.pipelineNextStep = 'Revise trial scope or reject candidate';
    await match.save();

    await createNotification({
      recipientType: 'builder',
      recipientEmail: builder.email,
      builderId: String(builder._id),
      type: 'trial_rejected',
      title: 'Trial feedback',
      body: note || 'Your trial submission was not approved. Check the portal for details.',
      link: builderDashboardLink('trials', { matchId: String(match._id) }),
      entityType: 'MatchRecord',
      entityId: String(match._id),
    });

    return {
      trialProject: mapTrialProjectFromMatch(match.trialProject),
      matchStatus: match.status,
    };
  }

  match.trialProject.status = 'approved';
  syncMatchPipelineStatus(match, 'offer');
  match.pipelineNextStep = 'Extend offer or hire now';
  await match.save();

  await createNotification({
    recipientType: 'founder',
    recipientEmail: params.founderEmail,
    type: 'trial_approved',
    title: 'Trial approved',
    body: `You approved ${builder.name}'s trial submission. Ready to hire?`,
    link: founderDashboardLink({
      builderId: params.builderId,
      opportunityId: params.opportunityId,
    }),
    entityType: 'MatchRecord',
    entityId: String(match._id),
  });

  return {
    trialProject: mapTrialProjectFromMatch(match.trialProject),
    matchStatus: match.status,
  };
}

export async function hireBuilder(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  note?: string;
  skipTrial?: boolean;
}) {
  const ctx = await loadFounderMatch(params);
  if ('error' in ctx) return ctx;

  const { opportunity, builder, match } = ctx;

  // RESTORE BEFORE GIT PUSH — intro call required before hiring
  // if (!params.skipTrial && !match.callCompletedAt) {
  //   return { error: 'Complete the intro call before hiring.', status: 400 as const };
  // }

  if (match.status === 'trial' && match.trialProject?.status !== 'approved' && !params.skipTrial) {
    return { error: 'Approve the trial submission before hiring, or hire directly after call.', status: 400 as const };
  }

  match.hireNote = params.note?.trim() || null;
  syncMatchPipelineStatus(match, 'hired');
  await match.save();

  opportunity.status = 'hired';
  await opportunity.save();

  await createNotification({
    recipientType: 'builder',
    recipientEmail: builder.email,
    builderId: String(builder._id),
    type: 'hired',
    title: 'You have been hired',
    body: `Congratulations! You were hired for ${opportunity.roleTitle} at ${opportunity.company}.`,
    link: builderDashboardLink('matches'),
    entityType: 'MatchRecord',
    entityId: String(match._id),
  });

  return {
    matchStatus: match.status,
    opportunityStatus: opportunity.status,
  };
}

export async function rejectBuilder(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  note?: string;
}) {
  const ctx = await loadFounderMatch(params);
  if ('error' in ctx) return ctx;

  const { match } = ctx;
  syncMatchPipelineStatus(match, 'closed');
  if (params.note?.trim()) {
    match.hireNote = params.note.trim();
  }
  await match.save();

  return { matchStatus: match.status };
}

export async function getBuilderActiveTrials(builderId: string) {
  const matches = await MatchRecord.find({
    builderId,
    status: { $in: ['trial', 'offer'] },
    'trialProject.status': { $in: ['sent', 'in_progress', 'submitted', 'rejected'] },
  })
    .sort({ updatedAt: -1 })
    .lean();

  const oppIds = matches.map((m) => m.opportunityId);
  const opportunities = await Opportunity.find({ _id: { $in: oppIds } }).lean();
  const oppById = new Map(opportunities.map((o) => [String(o._id), o]));

  return matches.map((match) => {
    const opp = oppById.get(String(match.opportunityId));
    return {
      matchId: String(match._id),
      opportunityId: String(match.opportunityId),
      builderId: String(match.builderId),
      matchStatus: match.status,
      roleTitle: opp?.roleTitle || 'Role',
      company: opp?.company || 'Startup',
      founderName: opp?.founderName || opp?.founderEmail?.split('@')[0] || 'Founder',
      trialProject: mapTrialProjectFromMatch(match.trialProject),
    };
  });
}
