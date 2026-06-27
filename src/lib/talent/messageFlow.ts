import MessageThread from '@/models/talent/MessageThread';
import Message from '@/models/talent/Message';
import Opportunity from '@/models/talent/Opportunity';
import BuilderProfile from '@/models/talent/BuilderProfile';
import IntroRequest from '@/models/talent/IntroRequest';
import { createNotification } from '@/lib/talent/notifications';
import { sendTalentEmail, dashboardDeepLink } from '@/lib/talent/talentEmail';

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
    ...extras,
  };
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

  if (params.senderType === 'founder' && builder?.email) {
    await createNotification({
      recipientType: 'builder',
      recipientEmail: builder.email,
      builderId: String(builder._id),
      type: 'intro_received',
      title: 'New message',
      body: `${thread.founderName || 'A founder'} sent you a message about ${opportunity?.roleTitle || 'a role'}.`,
      link: `/dashboard?tab=messages&threadId=${thread._id}`,
      entityType: 'IntroRequest',
      entityId: String(thread._id),
    });
    await sendTalentEmail({
      to: builder.email,
      subject: `New message about ${opportunity?.roleTitle || 'a role'}`,
      body: `${thread.founderName || 'A founder'} messaged you on DevLabs. Open your Messages tab to reply.`,
      ctaLabel: 'Open Messages',
      ctaUrl: dashboardDeepLink('messages'),
    });
  }

  if (params.senderType === 'builder' && thread.founderEmail) {
    await createNotification({
      recipientType: 'founder',
      recipientEmail: thread.founderEmail,
      type: 'intro_viewed',
      title: 'New message from builder',
      body: `${builder?.name || 'A builder'} replied about ${opportunity?.roleTitle || 'your role'}.`,
      link: `/dashboard?threadId=${thread._id}`,
      entityType: 'IntroRequest',
      entityId: String(thread._id),
    });
  }

  return { thread, message: serializeMessage(message) };
}

export async function getFounderThreads(founderEmail: string) {
  const threads = await MessageThread.find({ founderEmail: founderEmail.toLowerCase().trim() })
    .sort({ lastMessageAt: -1 })
    .lean();
  const builderIds = threads.map((t) => t.builderId);
  const oppIds = threads.map((t) => t.opportunityId);
  const [builders, opportunities] = await Promise.all([
    BuilderProfile.find({ _id: { $in: builderIds } }).select('name headline email').lean(),
    Opportunity.find({ _id: { $in: oppIds } }).select('roleTitle company').lean(),
  ]);
  const builderById = new Map(builders.map((b) => [String(b._id), b]));
  const oppById = new Map(opportunities.map((o) => [String(o._id), o]));

  return threads.map((t) =>
    serializeThread(t, {
      builderName: builderById.get(String(t.builderId))?.name || 'Builder',
      roleTitle: oppById.get(String(t.opportunityId))?.roleTitle,
      company: oppById.get(String(t.opportunityId))?.company,
    })
  );
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
  const thread = await MessageThread.findById(threadId).lean();
  if (!thread) return { error: 'Thread not found', status: 404 as const };

  if (reader.type === 'founder' && thread.founderEmail !== reader.email.toLowerCase().trim()) {
    return { error: 'Not authorized', status: 403 as const };
  }
  if (reader.type === 'builder' && String(thread.builderId) !== reader.builderId) {
    return { error: 'Not authorized', status: 403 as const };
  }

  const [messages, intro] = await Promise.all([
    Message.find({ threadId }).sort({ createdAt: 1 }).lean(),
    findIntroForThread(thread),
  ]);

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
    });
  }
  return thread;
}
