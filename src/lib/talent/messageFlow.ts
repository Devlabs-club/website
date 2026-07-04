import MessageThread from '@/models/talent/MessageThread';
import Message from '@/models/talent/Message';
import Opportunity from '@/models/talent/Opportunity';
import BuilderProfile from '@/models/talent/BuilderProfile';
import IntroRequest from '@/models/talent/IntroRequest';
import { createNotification } from '@/lib/talent/notifications';
import { sendTalentEmail, dashboardDeepLink } from '@/lib/talent/talentEmail';

const FOUNDER_UNREAD_REMINDER_MS = 15 * 60 * 1000;
const founderReminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

function founderConversationsLink(threadId?: string) {
  const base = (process.env.WEBSITE_ROOT || 'http://localhost:4321').replace(/\/$/, '');
  const suffix = threadId ? `?threadId=${encodeURIComponent(threadId)}` : '';
  return `${base}/founder/conversations${suffix}`;
}

function serializeMessage(doc: any) {
  return {
    _id: String(doc._id),
    threadId: String(doc.threadId),
    senderType: doc.senderType,
    body: doc.body,
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

function serializeIntro(intro: any) {
  if (!intro) return null;
  return {
    _id: String(intro._id),
    status: intro.status,
    introMessage: intro.introMessage,
    viewedAt: intro.viewedAt ? new Date(intro.viewedAt).toISOString() : null,
    founderName: intro.founderName || null,
  };
}

async function findIntroForThread(thread: any) {
  if (thread.introRequestId) {
    const byId = await IntroRequest.findById(thread.introRequestId).lean();
    if (byId) return byId;
  }
  return IntroRequest.findOne({
    opportunityId: thread.opportunityId,
    builderId: thread.builderId,
  })
    .sort({ createdAt: -1 })
    .lean();
}

function serializeThread(doc: any, extras: Record<string, unknown> = {}) {
  return {
    _id: String(doc._id),
    opportunityId: String(doc.opportunityId),
    builderId: String(doc.builderId),
    founderEmail: doc.founderEmail,
    founderName: doc.founderName,
    lastMessageAt: doc.lastMessageAt ? new Date(doc.lastMessageAt).toISOString() : null,
    lastMessagePreview: doc.lastMessagePreview,
    unreadCount: typeof extras.unreadCount === 'number' ? extras.unreadCount : 0,
    ...extras,
  };
}

async function sendFounderUnreadReminderIfNeeded(messageId: string) {
  const message = await Message.findById(messageId);
  if (!message || message.senderType !== 'builder' || message.readAt || message.founderUnreadEmailSentAt) return false;

  const thread = (await MessageThread.findById(message.threadId).lean()) as any;
  if (!thread?.founderEmail) return false;

  const [builder, opportunity] = await Promise.all([
    BuilderProfile.findById((thread as any).builderId).select('name').lean(),
    Opportunity.findById((thread as any).opportunityId).select('roleTitle company').lean(),
  ]);
  const builderName = (builder as any)?.name || 'A builder';
  const roleTitle = (opportunity as any)?.roleTitle || 'your role';

  try {
    await sendTalentEmail({
      to: (thread as any).founderEmail,
      subject: `Message from ${builderName} waiting for you`,
      body: `There is a message from ${builderName} waiting for you about ${roleTitle}.`,
      ctaLabel: 'Open conversation',
      ctaUrl: founderConversationsLink(String((thread as any)._id)),
    });
    message.founderUnreadEmailSentAt = new Date();
    message.founderUnreadEmailLastError = null;
    await message.save();
    return true;
  } catch (error) {
    message.founderUnreadEmailLastError = error instanceof Error ? error.message : String(error);
    await message.save();
    throw error;
  }
}

function scheduleFounderUnreadReminder(messageId: string, delayMs = FOUNDER_UNREAD_REMINDER_MS) {
  if (founderReminderTimers.has(messageId)) return;
  const timer = setTimeout(() => {
    founderReminderTimers.delete(messageId);
    void sendFounderUnreadReminderIfNeeded(messageId).catch((error) => {
      console.error('[messageFlow] founder unread reminder failed', { messageId, error });
    });
  }, delayMs);
  founderReminderTimers.set(messageId, timer);
}

export async function getOrCreateThread(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  founderName?: string;
  introRequestId?: string | null;
}) {
  const thread = await MessageThread.findOneAndUpdate(
    { opportunityId: params.opportunityId, builderId: params.builderId },
    {
      $setOnInsert: {
        opportunityId: params.opportunityId,
        builderId: params.builderId,
        founderEmail: params.founderEmail.toLowerCase().trim(),
        founderName: params.founderName || null,
        introRequestId: params.introRequestId || null,
      },
    },
    { upsert: true, new: true }
  );
  return thread;
}

export async function sendThreadMessage(params: {
  threadId: string;
  senderType: 'founder' | 'builder' | 'system';
  senderEmail?: string;
  body: string;
  suppressExternalDelivery?: boolean;
}) {
  const thread = await MessageThread.findById(params.threadId);
  if (!thread) return { error: 'Thread not found', status: 404 as const };

  const body = params.body.trim();
  if (!body) return { error: 'Message body is required', status: 400 as const };

  const message = await Message.create({
    threadId: thread._id,
    senderType: params.senderType,
    senderEmail: params.senderEmail || null,
    body,
  });

  thread.lastMessageAt = new Date();
  thread.lastMessagePreview = body.slice(0, 140);
  await thread.save();

  const [opportunity, builder] = await Promise.all([
    Opportunity.findById(thread.opportunityId).lean(),
    BuilderProfile.findById(thread.builderId).lean(),
  ]);
  const opportunityDoc = opportunity as any;
  const builderDoc = builder as any;

  if (params.senderType === 'founder' && builderDoc?.email && !params.suppressExternalDelivery) {
    await createNotification({
      recipientType: 'builder',
      recipientEmail: builderDoc.email,
      builderId: String(builderDoc._id),
      type: 'intro_received',
      title: 'New message',
      body: `${thread.founderName || 'A founder'} sent you a message about ${opportunityDoc?.roleTitle || 'a role'}.`,
      link: `/dashboard?tab=messages&threadId=${thread._id}`,
      entityType: 'IntroRequest',
      entityId: String(thread._id),
      sendEmail: false,
    });
    await sendTalentEmail({
      to: builderDoc.email,
      subject: `New message about ${opportunityDoc?.roleTitle || 'a role'}`,
      body: `${thread.founderName || 'A founder'} messaged you on DevLabs. Open your Messages tab to reply.`,
      ctaLabel: 'Open Messages',
      ctaUrl: dashboardDeepLink('messages'),
    });
    void (async () => {
      try {
        const { relayFounderMessageOverImessage } = await import('@/lib/builderClaim');
        await relayFounderMessageOverImessage({
          builderId: String(builderDoc._id),
          builderEmail: builderDoc.email,
          founderName: thread.founderName || thread.founderEmail.split('@')[0],
          company: opportunityDoc?.company || 'DevLabs',
          roleTitle: opportunityDoc?.roleTitle || 'the role',
          opportunityId: String(thread.opportunityId),
          threadId: String(thread._id),
          body,
        });
      } catch (err) {
        console.error('[messageFlow] founder iMessage relay failed', err);
      }
    })();
  }

  if (params.senderType === 'builder' && thread.founderEmail && !params.suppressExternalDelivery) {
    const builderName = builderDoc?.name || 'A builder';
    const roleTitle = opportunityDoc?.roleTitle || 'your role';
    await createNotification({
      recipientType: 'founder',
      recipientEmail: thread.founderEmail,
      type: 'intro_viewed',
      title: 'New builder reply',
      body: `${builderName} replied about ${roleTitle}.`,
      link: `/founder/conversations?threadId=${thread._id}`,
      entityType: 'IntroRequest',
      entityId: String(thread._id),
      sendEmail: false,
    });
    scheduleFounderUnreadReminder(String(message._id));
  }

  return { thread, message: serializeMessage(message) };
}

export async function getFounderThreads(founderEmail: string) {
  const threads = await MessageThread.find({ founderEmail: founderEmail.toLowerCase().trim() })
    .sort({ lastMessageAt: -1 })
    .lean();
  const builderIds = threads.map((t) => t.builderId);
  const oppIds = threads.map((t) => t.opportunityId);
  const threadIds = threads.map((t) => t._id);
  const [builders, opportunities, unreadByThread] = await Promise.all([
    BuilderProfile.find({ _id: { $in: builderIds } }).select('name headline email').lean(),
    Opportunity.find({ _id: { $in: oppIds } }).select('roleTitle company').lean(),
    Message.aggregate([
      {
        $match: {
          threadId: { $in: threadIds },
          senderType: 'builder',
          readAt: null,
        },
      },
      { $group: { _id: '$threadId', count: { $sum: 1 } } },
    ]),
  ]);
  const builderById = new Map(builders.map((b) => [String(b._id), b]));
  const oppById = new Map(opportunities.map((o) => [String(o._id), o]));
  const unreadByThreadId = new Map(unreadByThread.map((row: any) => [String(row._id), row.count]));

  return threads.map((t) =>
    serializeThread(t, {
      builderName: builderById.get(String(t.builderId))?.name || 'Builder',
      roleTitle: oppById.get(String(t.opportunityId))?.roleTitle,
      company: oppById.get(String(t.opportunityId))?.company,
      unreadCount: unreadByThreadId.get(String(t._id)) || 0,
    })
  );
}

export async function countUnreadFounderMessages(founderEmail: string) {
  const threads = await MessageThread.find({ founderEmail: founderEmail.toLowerCase().trim() }).select('_id').lean();
  if (!threads.length) return 0;
  return Message.countDocuments({
    threadId: { $in: threads.map((thread) => thread._id) },
    senderType: 'builder',
    readAt: null,
  });
}

export async function getBuilderThreads(builderId: string) {
  const threads = await MessageThread.find({ builderId }).sort({ lastMessageAt: -1 }).lean();
  const oppIds = threads.map((t) => t.opportunityId);
  const [opportunities, intros] = await Promise.all([
    Opportunity.find({ _id: { $in: oppIds } }).select('roleTitle company founderName').lean(),
    IntroRequest.find({ builderId, opportunityId: { $in: oppIds } }).lean(),
  ]);
  const oppById = new Map(opportunities.map((o) => [String(o._id), o]));
  const introById = new Map(intros.map((i) => [String(i._id), i]));
  const introByOpp = new Map(intros.map((i) => [String(i.opportunityId), i]));

  return threads.map((t) => {
    const intro =
      (t.introRequestId ? introById.get(String(t.introRequestId)) : null) ||
      introByOpp.get(String(t.opportunityId)) ||
      null;
    return serializeThread(t, {
      roleTitle: oppById.get(String(t.opportunityId))?.roleTitle,
      company: oppById.get(String(t.opportunityId))?.company,
      founderName: t.founderName || oppById.get(String(t.opportunityId))?.founderName,
      introRequestId: intro ? String(intro._id) : null,
      introStatus: intro?.status || null,
    });
  });
}

export async function getThreadMessages(threadId: string, reader: { type: 'founder'; email: string } | { type: 'builder'; builderId: string }) {
  const thread = (await MessageThread.findById(threadId).lean()) as any;
  if (!thread) return { error: 'Thread not found', status: 404 as const };

  if (reader.type === 'founder' && thread.founderEmail !== reader.email.toLowerCase().trim()) {
    return { error: 'Not authorized', status: 403 as const };
  }
  if (reader.type === 'builder' && String(thread.builderId) !== reader.builderId) {
    return { error: 'Not authorized', status: 403 as const };
  }

  const [messages, introRaw] = await Promise.all([
    Message.find({ threadId }).sort({ createdAt: 1 }).lean(),
    findIntroForThread(thread),
  ]);
  const intro = introRaw as any;

  if (reader.type === 'founder') {
    await Message.updateMany(
      { threadId, senderType: 'builder', readAt: null },
      { $set: { readAt: new Date() } }
    );
  }

  return {
    thread: serializeThread(thread, {
      introRequestId: intro ? String(intro._id) : null,
      introStatus: intro?.status || null,
    }),
    messages: messages.map(serializeMessage),
    introRequest: serializeIntro(intro),
  };
}

export async function seedThreadFromIntro(intro: any) {
  const thread = await getOrCreateThread({
    opportunityId: String(intro.opportunityId),
    builderId: String(intro.builderId),
    founderEmail: intro.founderEmail,
    founderName: intro.founderName,
    introRequestId: String(intro._id),
  });

  const existing = await Message.countDocuments({ threadId: thread._id });
  if (existing === 0 && intro.introMessage) {
    await sendThreadMessage({
      threadId: String(thread._id),
      senderType: 'founder',
      senderEmail: intro.founderEmail,
      body: intro.introMessage,
      suppressExternalDelivery: true,
    });
  }
  return thread;
}

export async function sendPendingFounderUnreadReminders() {
  const cutoff = new Date(Date.now() - FOUNDER_UNREAD_REMINDER_MS);
  const messages = await Message.find({
    senderType: 'builder',
    readAt: null,
    founderUnreadEmailSentAt: null,
    createdAt: { $lte: cutoff },
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .select('_id')
    .lean();

  let sent = 0;
  for (const message of messages) {
    try {
      if (await sendFounderUnreadReminderIfNeeded(String((message as any)._id))) sent += 1;
    } catch {
      // Error is persisted on the message and logged by the caller if needed.
    }
  }
  return { checked: messages.length, sent };
}
