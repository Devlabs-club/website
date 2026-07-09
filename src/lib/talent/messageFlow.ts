import MessageThread from '@/models/talent/MessageThread';
import Message from '@/models/talent/Message';
import Opportunity from '@/models/talent/Opportunity';
import BuilderProfile from '@/models/talent/BuilderProfile';
import IntroRequest from '@/models/talent/IntroRequest';
import { stripQuotedReplyText } from '@/lib/talent/emailThreadText';
import { getOutboundThreadSubject } from '@/lib/talent/threadRelayHelpers';
import { sendThreadRelayEmail, type ThreadRelaySource } from '@/lib/talent/talentEmail';

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
    emailSubject: doc.emailSubject || null,
    lastMessageAt: doc.lastMessageAt ? new Date(doc.lastMessageAt).toISOString() : null,
    lastMessagePreview: doc.lastMessagePreview,
    unreadCount: typeof extras.unreadCount === 'number' ? extras.unreadCount : 0,
    ...extras,
  };
}

export async function getOrCreateThread(params: {
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  founderName?: string;
  introRequestId?: string | null;
  builderEmail?: string | null;
}) {
  const normalizedBuilderEmail = params.builderEmail?.toLowerCase().trim() || null;
  const update: Record<string, unknown> = {
    $setOnInsert: {
      opportunityId: params.opportunityId,
      builderId: params.builderId,
      founderEmail: params.founderEmail.toLowerCase().trim(),
      founderName: params.founderName || null,
      introRequestId: params.introRequestId || null,
    },
  };
  if (normalizedBuilderEmail) {
    update.$set = { builderEmail: normalizedBuilderEmail };
  }

  const thread = await MessageThread.findOneAndUpdate(
    { opportunityId: params.opportunityId, builderId: params.builderId },
    update,
    { upsert: true, new: true }
  );
  return thread;
}

export async function persistThreadMessage(params: {
  threadId: string;
  senderType: 'founder' | 'builder' | 'system';
  senderEmail?: string;
  body: string;
  internetMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  source?: ThreadRelaySource;
}) {
  const thread = await MessageThread.findById(params.threadId);
  if (!thread) return { error: 'Thread not found', status: 404 as const };

  const body = stripQuotedReplyText(params.body.trim());
  if (!body) return { error: 'Message body is required', status: 400 as const };

  if (params.internetMessageId) {
    const dup = await Message.findOne({ messageId: params.internetMessageId }).lean();
    if (dup) return { thread, message: serializeMessage(dup), duplicate: true as const };
  }

  const recipientRole = params.senderType === 'founder' ? 'builder' : 'founder';
  const message = await Message.create({
    threadId: thread._id,
    senderType: params.senderType,
    senderEmail: params.senderEmail || null,
    recipientRole,
    direction: 'inbound',
    messageId: params.internetMessageId || null,
    inReplyTo: params.inReplyTo || null,
    references: params.references || [],
    subject: getOutboundThreadSubject(thread),
    body,
    text: body,
    source: params.source || 'gmail_reply',
  });

  thread.lastMessageAt = new Date();
  thread.lastMessagePreview = body.slice(0, 140);
  await thread.save();

  return { thread, message: serializeMessage(message) };
}

export async function relayThreadEmail(params: {
  threadId: string;
  body: string;
  senderRole: 'founder' | 'builder';
  source?: ThreadRelaySource;
}) {
  const thread = await MessageThread.findById(params.threadId);
  if (!thread) return { error: 'Thread not found', status: 404 as const };

  const body = stripQuotedReplyText(params.body.trim());
  if (!body) return { error: 'Message body is required', status: 400 as const };

  const [builder, opportunity] = await Promise.all([
    BuilderProfile.findById(thread.builderId).select('email name').lean(),
    Opportunity.findById(thread.opportunityId).select('roleTitle company').lean(),
  ]);
  const builderDoc = builder as any;
  const opportunityDoc = opportunity as any;

  const recipientRole = params.senderRole === 'founder' ? 'builder' : 'founder';
  const recipientEmail =
    recipientRole === 'builder' ? builderDoc?.email : thread.founderEmail;
  if (!recipientEmail) return { error: 'Recipient email missing', status: 422 as const };

  const roleTitle = opportunityDoc?.roleTitle || 'a role';
  const company = opportunityDoc?.company || 'a startup';

  const result = await sendThreadRelayEmail({
    thread,
    senderRole: params.senderRole,
    recipientRole,
    recipientEmail,
    recipientName: recipientRole === 'builder' ? builderDoc?.name : thread.founderName,
    context: {
      kind: 'reply',
      senderName:
        params.senderRole === 'builder'
          ? builderDoc?.name || 'A builder'
          : thread.founderName || 'The founder',
      senderRole: params.senderRole,
      roleTitle,
      company,
      message: body,
    },
    plainText: body,
    source: params.source || 'gmail_reply',
    tracking: {
      threadId: String(thread._id),
      opportunityId: String(thread.opportunityId),
      builderId: String(thread.builderId),
      founderEmail: thread.founderEmail,
      introRequestId: thread.introRequestId ? String(thread.introRequestId) : null,
    },
  });

  return { sent: result.sent, messageId: result.messageId || null };
}

/** Persist a message to Mongo only — Gmail relay happens separately via inbound/outbound relay. */
export async function sendThreadMessage(params: {
  threadId: string;
  senderType: 'founder' | 'builder' | 'system';
  senderEmail?: string;
  body: string;
  suppressExternalDelivery?: boolean;
  internetMessageId?: string | null;
}) {
  void params.suppressExternalDelivery;
  return persistThreadMessage({
    threadId: params.threadId,
    senderType: params.senderType,
    senderEmail: params.senderEmail,
    body: params.body,
    internetMessageId: params.internetMessageId,
    source: 'system',
  });
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
      builderEmail: builderById.get(String(t.builderId))?.email || t.builderEmail || null,
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
  const builder = await BuilderProfile.findById(intro.builderId).select('email').lean();
  const thread = await getOrCreateThread({
    opportunityId: String(intro.opportunityId),
    builderId: String(intro.builderId),
    founderEmail: intro.founderEmail,
    founderName: intro.founderName,
    introRequestId: String(intro._id),
    builderEmail: (builder as any)?.email || null,
  });

  const existing = await Message.countDocuments({ threadId: thread._id, direction: 'inbound' });
  const existingOutbound = await Message.countDocuments({ threadId: thread._id, direction: 'outbound' });
  if (existing === 0 && existingOutbound === 0 && intro.introMessage) {
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
  return { checked: 0, sent: 0 };
}
