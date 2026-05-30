import IntroRequest from '@/models/talent/IntroRequest';
import MessageThread from '@/models/talent/MessageThread';
import MatchRecord from '@/models/talent/MatchRecord';
import Opportunity from '@/models/talent/Opportunity';
import BuilderProfile from '@/models/talent/BuilderProfile';
import {
  builderDashboardLink,
  createNotification,
  founderDashboardLink,
} from '@/lib/talent/notifications';
import { syncMatchPipelineStatus } from '@/lib/talent/founderPipeline';

export async function notifyBuilderIntroReceived(params: {
  builderId: string;
  builderEmail: string;
  founderName: string;
  roleTitle: string;
  company: string;
  introRequestId: string;
}) {
  return createNotification({
    recipientType: 'builder',
    recipientEmail: params.builderEmail,
    builderId: params.builderId,
    type: 'intro_received',
    title: 'New intro request',
    body: `${params.founderName} invited you to discuss ${params.roleTitle} at ${params.company}.`,
    link: builderDashboardLink('messages', { introId: params.introRequestId }),
    entityType: 'IntroRequest',
    entityId: params.introRequestId,
  });
}

export async function getBuilderIntroInbox(builderId: string) {
  const intros = await IntroRequest.find({
    builderId,
    status: 'requested',
  })
    .sort({ createdAt: -1 })
    .lean();

  const oppIds = intros.map((i) => i.opportunityId);
  const [opportunities, threads] = await Promise.all([
    Opportunity.find({ _id: { $in: oppIds } }).lean(),
    MessageThread.find({ builderId }).select('_id opportunityId introRequestId').lean(),
  ]);
  const oppById = new Map(opportunities.map((o) => [String(o._id), o]));
  const threadByOpp = new Map(threads.map((t) => [String(t.opportunityId), t]));

  return intros.map((intro) => {
    const opp = oppById.get(String(intro.opportunityId));
    const thread = threadByOpp.get(String(intro.opportunityId));
    return {
      _id: String(intro._id),
      opportunityId: String(intro.opportunityId),
      builderId: String(intro.builderId),
      matchRecordId: intro.matchRecordId ? String(intro.matchRecordId) : null,
      threadId: thread ? String(thread._id) : null,
      founderEmail: intro.founderEmail,
      founderName: intro.founderName || intro.founderEmail.split('@')[0],
      introMessage: intro.introMessage,
      status: intro.status,
      viewedAt: intro.viewedAt ? new Date(intro.viewedAt).toISOString() : null,
      createdAt: new Date(intro.createdAt).toISOString(),
      roleTitle: opp?.roleTitle || 'Role',
      company: opp?.company || 'Startup',
      startupSummary: opp?.startupSummary || null,
      timeline: opp?.timeline || null,
      budget: opp?.budget || null,
    };
  });
}

export async function respondToIntro(params: {
  introRequestId: string;
  builderId: string;
  response: 'view' | 'accept' | 'decline';
  note?: string;
  declineReason?: string;
}) {
  const intro = await IntroRequest.findOne({
    _id: params.introRequestId,
    builderId: params.builderId,
  });
  if (!intro) return { error: 'Intro request not found', status: 404 as const };

  if (intro.status !== 'requested' && params.response !== 'view') {
    return { error: 'Intro request already responded to', status: 400 as const };
  }

  const match = await MatchRecord.findOne({
    opportunityId: intro.opportunityId,
    builderId: intro.builderId,
  });
  const builder = await BuilderProfile.findById(intro.builderId).select('name email').lean();
  const opportunity = await Opportunity.findById(intro.opportunityId).lean();
  const builderName = builder?.name || 'Builder';
  const roleTitle = opportunity?.roleTitle || 'role';
  const company = opportunity?.company || 'startup';

  if (params.response === 'view') {
    if (!intro.viewedAt) {
      intro.viewedAt = new Date();
      await intro.save();
      await createNotification({
        recipientType: 'founder',
        recipientEmail: intro.founderEmail,
        type: 'intro_viewed',
        title: 'Intro viewed',
        body: `${builderName} viewed your intro for ${roleTitle}.`,
        link: founderDashboardLink({
          builderId: String(intro.builderId),
          opportunityId: String(intro.opportunityId),
        }),
        entityType: 'IntroRequest',
        entityId: String(intro._id),
      });
    }
    return { intro, match, opportunity, builder };
  }

  intro.respondedAt = new Date();
  if (params.response === 'accept') {
    intro.status = 'builder_accepted';
    intro.builderResponseNote = params.note?.trim() || null;
    if (match) {
      syncMatchPipelineStatus(match, 'builder_interested');
      await match.save();
    }
    await intro.save();
    await createNotification({
      recipientType: 'founder',
      recipientEmail: intro.founderEmail,
      type: 'intro_accepted',
      title: 'Builder accepted intro',
      body: `${builderName} accepted your intro — schedule a call to connect.`,
      link: founderDashboardLink({
        builderId: String(intro.builderId),
        opportunityId: String(intro.opportunityId),
      }),
      entityType: 'IntroRequest',
      entityId: String(intro._id),
    });
  } else {
    intro.status = 'builder_declined';
    intro.builderDeclineReason = params.declineReason?.trim() || params.note?.trim() || null;
    if (match) {
      syncMatchPipelineStatus(match, 'closed');
      await match.save();
    }
    await intro.save();
    await createNotification({
      recipientType: 'founder',
      recipientEmail: intro.founderEmail,
      type: 'intro_declined',
      title: 'Intro declined',
      body: `${builderName} declined the intro for ${roleTitle}.`,
      link: founderDashboardLink({ opportunityId: String(intro.opportunityId) }),
      entityType: 'IntroRequest',
      entityId: String(intro._id),
    });
  }

  return { intro, match, opportunity, builder };
}
