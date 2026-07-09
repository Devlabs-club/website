import IntroRequest from '@/models/talent/IntroRequest';
import MessageThread from '@/models/talent/MessageThread';
import MatchRecord from '@/models/talent/MatchRecord';
import Opportunity from '@/models/talent/Opportunity';
import BuilderProfile from '@/models/talent/BuilderProfile';
import FounderProfile from '@/models/talent/FounderProfile';
import CompanyProfile from '@/models/founder/CompanyProfile';
import { builderDashboardLink, createNotification, founderDashboardLink } from '@/lib/talent/notifications';
import { sendThreadRelayEmail } from '@/lib/talent/talentEmail';
import { renderThreadEmailText } from '@/lib/talent/threadEmailTemplate';
import { getOrCreateThread, seedThreadFromIntro } from '@/lib/talent/messageFlow';
import { syncMatchPipelineStatus } from '@/lib/talent/founderPipeline';

/** Seed the Gmail thread and send intro + founder confirmation emails. */
export async function deliverIntroRequest(params: {
  intro: { _id: { toString(): string }; opportunityId: unknown; builderId: unknown; founderEmail: string; founderName?: string | null; introMessage?: string | null };
  builderId: string;
  builderEmail: string;
  founderName: string;
  founderEmail: string;
  roleTitle: string;
  company: string;
  opportunityId: string;
}) {
  const thread = await seedThreadFromIntro(params.intro);
  await notifyBuilderIntroReceived({
    builderId: params.builderId,
    builderEmail: params.builderEmail,
    founderName: params.founderName,
    founderEmail: params.founderEmail,
    roleTitle: params.roleTitle,
    company: params.company,
    introRequestId: String(params.intro._id),
    opportunityId: params.opportunityId,
    threadId: String(thread._id),
  });
  return thread;
}

/** Email the builder about a new intro and seed the founder's Gmail thread. */
export async function notifyBuilderIntroReceived(params: {
  builderId: string;
  builderEmail: string;
  founderName: string;
  founderEmail?: string;
  roleTitle: string;
  company: string;
  introRequestId: string;
  opportunityId?: string;
  threadId?: string | null;
}) {
  // Resolve the founder's Cal.com/Calendly link so the builder can book the
  // interview straight from the iMessage ping. Best-effort — missing it just
  // falls back to the plain "reply here" message.
  let schedulingLink: string | null = null;
  if (params.founderEmail) {
    try {
      const founderProfile = (await FounderProfile.findOne({
        founderEmail: params.founderEmail.toLowerCase(),
      })
        .select('schedulingLink')
        .lean()) as any;
      schedulingLink = founderProfile?.schedulingLink || null;
    } catch (err) {
      console.error('[introFlow] founder scheduling link lookup failed', err);
    }
  }

  let founderBio: string | null = null;
  let companySummary: string | null = null;
  let website: string | null = null;
  if (params.founderEmail) {
    try {
      const [founderProfile, companyProfile] = await Promise.all([
        FounderProfile.findOne({ founderEmail: params.founderEmail.toLowerCase() }).lean(),
        CompanyProfile.findOne({ founderEmail: params.founderEmail.toLowerCase() }).lean(),
      ]);
      founderBio = (founderProfile as any)?.founderBio || null;
      companySummary = (companyProfile as any)?.description || (founderProfile as any)?.startupSummary || null;
      website = (companyProfile as any)?.website || (founderProfile as any)?.companyWebsite || null;
    } catch (err) {
      console.error('[introFlow] founder/company brief lookup failed', err);
    }
  }

  const intro = (await IntroRequest.findById(params.introRequestId).select('introMessage').lean()) as any;
  const introMessage =
    intro?.introMessage ||
    `${params.founderName} invited you to discuss ${params.roleTitle} at ${params.company}.`;

  const emailSubject = `${params.founderName} invited you to ${params.roleTitle} at ${params.company}`;
  const emailContext = {
    kind: 'intro' as const,
    founderName: params.founderName,
    roleTitle: params.roleTitle,
    company: params.company,
    introMessage,
    founderBio,
    companySummary,
    website,
    schedulingLink,
  };

  const builderProfile = (await BuilderProfile.findById(params.builderId).select('name').lean()) as any;
  const builderName = builderProfile?.name || params.builderEmail.split('@')[0] || 'the builder';

  if (params.threadId && params.founderEmail) {
    const thread =
      (await MessageThread.findById(params.threadId)) ||
      (await getOrCreateThread({
        opportunityId: params.opportunityId || '',
        builderId: params.builderId,
        founderEmail: params.founderEmail,
        founderName: params.founderName,
        introRequestId: params.introRequestId,
        builderEmail: params.builderEmail,
      }));

    thread.emailSubject = emailSubject;
    await thread.save();

    const tracking = {
      threadId: String(thread._id),
      introRequestId: params.introRequestId,
      opportunityId: params.opportunityId,
      builderId: params.builderId,
      founderEmail: params.founderEmail,
      metadata: { roleTitle: params.roleTitle, company: params.company },
    };

    await sendThreadRelayEmail({
      thread,
      senderRole: 'founder',
      recipientRole: 'builder',
      recipientEmail: params.builderEmail,
      recipientName: builderName,
      context: emailContext,
      plainText: renderThreadEmailText(emailContext),
      source: 'dashboard_intro',
      setAsRoot: true,
      emailSubject,
      tracking,
    }).catch((err) => console.error('[introFlow] builder intro email failed', err));

    await sendThreadRelayEmail({
      thread,
      senderRole: 'system',
      recipientRole: 'founder',
      recipientEmail: params.founderEmail,
      recipientName: params.founderName,
      fromDisplayName: 'DevLabs Intros',
      context: {
        kind: 'founder_seed',
        founderName: params.founderName,
        builderName,
        roleTitle: params.roleTitle,
        company: params.company,
      },
      plainText: [
        `You requested an intro to ${builderName}.`,
        '',
        `We'll keep this Gmail thread updated when ${builderName} replies.`,
        '',
        `Builder: ${builderName}`,
        `Role: ${params.roleTitle} at ${params.company}`,
      ].join('\n'),
      source: 'dashboard_intro_confirmation',
      emailSubject,
      tracking,
    }).catch((err) => console.error('[introFlow] founder seed email failed', err));
  }

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
    sendEmail: false,
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
  const builder = (await BuilderProfile.findById(intro.builderId).select('name email').lean()) as any;
  const opportunity = (await Opportunity.findById(intro.opportunityId).lean()) as any;
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

/**
 * Notify the founder that a builder is showing casual interest in an intro request
 * — short of a formal accept, just "they're warm, worth reaching out." Idempotent:
 * only the first signal notifies; later casual signals on the same intro no-op.
 * A later formal accept still fires its own separate `intro_accepted` notification.
 */
export async function notifyFounderOfBuilderInterest(params: {
  introRequestId: string;
  builderId: string;
  note?: string;
}) {
  const intro = await IntroRequest.findOne({
    _id: params.introRequestId,
    builderId: params.builderId,
  });
  if (!intro) return { error: 'Intro request not found', status: 404 as const };

  if (intro.founderNotifiedOfInterestAt) return { intro, notified: false };

  intro.founderNotifiedOfInterestAt = new Date();
  await intro.save();

  const [builder, opportunity] = (await Promise.all([
    BuilderProfile.findById(intro.builderId).select('name').lean(),
    Opportunity.findById(intro.opportunityId).lean(),
  ])) as any[];
  const builderName = builder?.name || 'Builder';
  const roleTitle = opportunity?.roleTitle || 'your role';

  await createNotification({
    recipientType: 'founder',
    recipientEmail: intro.founderEmail,
    type: 'intro_interested',
    title: 'Builder is interested',
    body: `${builderName} showed interest in ${roleTitle} — worth reaching out.`,
    link: founderDashboardLink({ builderId: String(intro.builderId), opportunityId: String(intro.opportunityId) }),
    entityType: 'IntroRequest',
    entityId: String(intro._id),
    sendEmail: false,
  });

  return { intro, notified: true };
}
