import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import Message from '@/models/talent/Message';
import MessageThread from '@/models/talent/MessageThread';
import BuilderProfile from '@/models/talent/BuilderProfile';
import IntroRequest from '@/models/talent/IntroRequest';
import MatchRecord from '@/models/talent/MatchRecord';
import { persistThreadMessage, relayThreadEmail } from '@/lib/talent/messageFlow';
import { respondToIntro, notifyFounderOfBuilderInterest } from '@/lib/talent/introFlow';
import { submitTrialByBuilder } from '@/lib/talent/trialFlow';
import {
  extractTrialSubmissionFromEmail,
  normalizeMessageId,
  stripQuotedReplyText,
} from '@/lib/talent/emailThreadText';
import {
  isAutoReply,
  parseInboundHeaders,
  parseThreadRecipient,
  resolveSenderRole,
  verifyReplyToken,
} from '@/lib/talent/threadRelayHelpers';

export const prerender = false;

function ok(body: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ success: true, ...body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ignored(reason: string, extra: Record<string, unknown> = {}) {
  console.info('[sendgrid-inbound] ignored', { reason, ...extra });
  return ok({ ignored: true, reason });
}

function emailFromHeader(value: string | null) {
  if (!value) return '';
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match?.[0] || value).toLowerCase().trim();
}

function inferIntroReplyIntent(body: string): 'accept' | 'decline' | null {
  const text = body
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const declinePatterns = [
    /\b(no|nope|nah)\b/,
    /\b(not interested|not available|not a fit|not the right fit)\b/,
    /\b(pass|decline|reject|turn it down)\b/,
    /\b(can't|cannot|wont|won't|unable to)\b/,
    /\b(no thanks|thanks but|unfortunately)\b/,
  ];
  const acceptPatterns = [
    /\b(yes|yeah|yep|sure|absolutely)\b/,
    /\b(interested|open to|sounds good|works for me)\b/,
    /\b(happy to|would love to|let's do it|lets do it)\b/,
    /\b(schedule|scheduled|book|booked|calendar|calendly|cal\.com)\b/,
    /\b(accept|accepted|available)\b/,
  ];

  const declined = declinePatterns.some((pattern) => pattern.test(text));
  const accepted = acceptPatterns.some((pattern) => pattern.test(text));
  if (accepted && !declined) return 'accept';
  if (declined && !accepted) return 'decline';
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const expected = process.env.SENDGRID_INBOUND_WEBHOOK_SECRET?.trim();
  if (expected) {
    const provided =
      request.headers.get('x-devlabs-sendgrid-secret') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (provided !== expected) return ignored('unauthorized_webhook');
  }

  const form = await request.formData().catch(() => null);
  if (!form) return ignored('invalid_form');

  const to = String(form.get('to') || form.get('recipient') || '');
  const from = emailFromHeader(String(form.get('from') || ''));
  const rawBody = String(form.get('text') || form.get('stripped-text') || '').trim();
  const headersRaw = String(form.get('headers') || '');
  const headerMap = parseInboundHeaders(headersRaw);

  if (isAutoReply(headerMap)) return ignored('auto_reply', { from });

  const parsed = parseThreadRecipient(to, String(form.get('cc') || ''), String(form.get('envelope') || ''));
  if (!parsed?.threadId) return ignored('missing_thread_recipient', { to: to.slice(0, 120) });

  if (!from || !rawBody) return ignored('missing_sender_or_body');

  await connectAdminDB();
  const thread = await MessageThread.findById(parsed.threadId);
  if (!thread) return ignored('unknown_thread', { threadId: parsed.threadId });

  if (!verifyReplyToken(thread, parsed.token)) {
    return ignored('invalid_reply_token', { threadId: parsed.threadId });
  }

  const builder = await BuilderProfile.findById(thread.builderId).select('email').lean() as any;
  const senderRole = resolveSenderRole(thread, builder?.email, from);
  if (!senderRole) return ignored('unauthorized_sender', { from, threadId: parsed.threadId });

  const inboundMessageId = normalizeMessageId(
    headerMap['message-id'] || headerMap.message-id
  );
  if (inboundMessageId) {
    const duplicate = await Message.findOne({ messageId: inboundMessageId }).lean();
    if (duplicate) return ignored('duplicate_message_id', { messageId: inboundMessageId });
  }

  const inReplyTo = normalizeMessageId(headerMap['in-reply-to']);
  const references = (headerMap.references || '')
    .split(/\s+/)
    .map((id) => normalizeMessageId(id))
    .filter((id): id is string => Boolean(id));

  const body = stripQuotedReplyText(rawBody);
  if (!body) return ignored('empty_body_after_strip');

  const persist = await persistThreadMessage({
    threadId: parsed.threadId,
    senderType: senderRole,
    senderEmail: from,
    body,
    internetMessageId: inboundMessageId,
    inReplyTo,
    references,
    source: 'gmail_reply',
  });
  if ('error' in persist) return ignored('persist_failed', { error: persist.error });
  if ('duplicate' in persist && persist.duplicate) {
    return ignored('duplicate_message_id', { messageId: inboundMessageId });
  }

  let introIntent: 'accept' | 'decline' | null = null;
  let trialSubmitted = false;

  if (senderRole === 'builder') {
    const match = await MatchRecord.findOne({
      opportunityId: thread.opportunityId,
      builderId: thread.builderId,
    });
    const trialStatus = match?.trialProject?.status;
    if (match && trialStatus && ['sent', 'in_progress', 'rejected'].includes(trialStatus)) {
      const { githubUrl, videoUrl } = extractTrialSubmissionFromEmail(body);
      if (githubUrl && videoUrl) {
        const submission = await submitTrialByBuilder({
          opportunityId: String(thread.opportunityId),
          builderId: String(thread.builderId),
          videoUrl,
          githubUrl,
          notes: body,
        });
        if (!('error' in submission)) trialSubmitted = true;
      }
    }

    if (!trialSubmitted) {
      const introLookup: any[] = [{ opportunityId: thread.opportunityId, builderId: thread.builderId }];
      if (thread.introRequestId) introLookup.unshift({ _id: thread.introRequestId });
      const intro = await IntroRequest.findOne({
        $or: introLookup,
        status: 'requested',
      }).sort({ createdAt: -1 });

      introIntent = inferIntroReplyIntent(body);
      if (introIntent && intro) {
        await respondToIntro({
          introRequestId: String(intro._id),
          builderId: String(thread.builderId),
          response: introIntent,
          note: body,
          declineReason: introIntent === 'decline' ? body : undefined,
        });
      } else if (intro) {
        await notifyFounderOfBuilderInterest({
          introRequestId: String(intro._id),
          builderId: String(thread.builderId),
          note: body,
        }).catch((err) => console.error('[sendgrid-inbound] founder interest notify failed', err));
      }
    }
  }

  const relay = await relayThreadEmail({
    threadId: parsed.threadId,
    senderRole,
    body,
    source: trialSubmitted ? 'trial_submission_email' : 'gmail_reply',
  });
  if ('error' in relay) {
    console.error('[sendgrid-inbound] relay failed', {
      threadId: parsed.threadId,
      from,
      error: relay.error,
    });
  }

  console.info('[sendgrid-inbound] processed', {
    threadId: parsed.threadId,
    from,
    senderRole,
    introIntent,
    trialSubmitted,
    relayed: 'sent' in relay ? relay.sent : false,
  });

  return ok({
    threadId: parsed.threadId,
    message: persist.message,
    introIntent,
    trialSubmitted,
    relay,
  });
};
