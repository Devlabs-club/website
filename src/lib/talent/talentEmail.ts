import sgMail from '@sendgrid/mail';
import { connectAdminDB } from '@/lib/mongodb';
import Message from '@/models/talent/Message';
import TalentEmailDelivery from '@/models/talent/TalentEmailDelivery';
import {
  applyOutboundThreadState,
  buildOutboundThreadHeaders,
  ensureThreadReplyToken,
  generateRfcMessageId,
  getFromDisplayName,
  getOutboundThreadSubject,
  replyAddressForThread,
} from '@/lib/talent/threadRelayHelpers';
import {
  renderTalentNotificationHtml,
  renderThreadEmailHtml,
  renderThreadEmailText,
  type ThreadEmailContext,
} from '@/lib/talent/threadEmailTemplate';

export { replyAddressForThread };

const DEV_MODE = import.meta.env.DEV || process.env.NODE_ENV === 'development';
const EMAIL_ENABLED = process.env.TALENT_EMAIL_NOTIFICATIONS === 'true' || !DEV_MODE;
const FROM_EMAIL = process.env.CLAIM_FROM || process.env.MAIL_FROM || 'people@devlabs.club';

export type ThreadRelayTracking = {
  threadId?: string | null;
  introRequestId?: string | null;
  matchRecordId?: string | null;
  opportunityId?: string | null;
  builderId?: string | null;
  founderEmail?: string | null;
  metadata?: Record<string, unknown>;
};

export type ThreadRelaySource =
  | 'dashboard_intro'
  | 'dashboard_intro_confirmation'
  | 'gmail_reply'
  | 'dashboard_trial'
  | 'trial_submission_email'
  | 'system';

export type SendThreadRelayEmailInput = {
  thread: {
    _id: { toString(): string };
    opportunityId?: { toString(): string } | string;
    builderId?: { toString(): string } | string;
    founderEmail?: string | null;
    founderName?: string | null;
    emailSubject?: string | null;
    rootMessageId?: string | null;
    lastMessageId?: string | null;
    references?: string[];
    founderThreadState?: { firstMessageId?: string; lastMessageId?: string; references?: string[] };
    builderThreadState?: { firstMessageId?: string; lastMessageId?: string; references?: string[] };
    replyTokenHash?: string | null;
    save(): Promise<unknown>;
    markModified?(key: string): void;
  };
  senderRole: 'founder' | 'builder' | 'system';
  recipientRole: 'founder' | 'builder';
  recipientEmail: string;
  recipientName?: string | null;
  context: ThreadEmailContext;
  plainText: string;
  source: ThreadRelaySource;
  fromDisplayName?: string | null;
  tracking?: ThreadRelayTracking;
  /** Set on the first builder intro email only. */
  setAsRoot?: boolean;
  emailSubject?: string;
};

/**
 * Send a threaded relay email with per-recipient In-Reply-To / References state.
 * RFC Message-ID is generated before send — never uses SendGrid x-message-id for threading.
 */
export async function sendThreadRelayEmail(
  input: SendThreadRelayEmailInput
): Promise<{ sent: boolean; reason?: string; messageId?: string | null }> {
  const threadId = input.thread._id.toString();
  const subject = getOutboundThreadSubject({
    emailSubject: input.emailSubject || input.thread.emailSubject,
  });

  if (!EMAIL_ENABLED) {
    console.log('[threadRelay] skipped (dev mode or disabled)', subject, '→', input.recipientEmail);
    return { sent: false, reason: 'disabled' };
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[threadRelay] missing SENDGRID_API_KEY');
    return { sent: false, reason: 'no_credentials' };
  }
  sgMail.setApiKey(apiKey);

  const replyToken = await ensureThreadReplyToken(input.thread as any);

  const kind = input.context.kind === 'founder_seed' ? 'intro_confirmation' : input.context.kind;
  const outboundMessageId = generateRfcMessageId({ threadId, kind });
  const { inReplyTo, references, headers } = buildOutboundThreadHeaders(
    input.thread,
    input.recipientRole,
    outboundMessageId
  );

  const html = renderThreadEmailHtml(input.context);
  const text = input.plainText.trim() || renderThreadEmailText(input.context);
  const fromName = getFromDisplayName(input.senderRole, input.thread, input.fromDisplayName);
  const tracking = input.tracking || {};

  const customArgs: Record<string, string> = {
    emailType: 'thread_relay',
    source: input.source,
    threadId,
    ...(tracking.introRequestId ? { introRequestId: tracking.introRequestId } : {}),
    ...(tracking.matchRecordId ? { matchRecordId: tracking.matchRecordId } : {}),
    ...(tracking.opportunityId ? { opportunityId: tracking.opportunityId } : {}),
    ...(tracking.builderId ? { builderId: tracking.builderId } : {}),
    ...(tracking.founderEmail ? { founderEmail: tracking.founderEmail } : {}),
  };

  const [response] = await sgMail.send({
    from: { email: FROM_EMAIL, name: fromName },
    to: input.recipientEmail,
    replyTo: {
      email: replyAddressForThread(threadId, replyToken),
      name: 'Reply to DevLabs thread',
    },
    subject,
    text,
    html,
    headers: {
      ...headers,
      'X-DevLabs-Thread-ID': threadId,
      'X-DevLabs-Source': input.source,
    },
    categories: ['talent', 'thread_relay', input.source],
    customArgs,
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false },
      subscriptionTracking: { enable: false },
    },
  });

  const sendgridMessageId = response.headers?.['x-message-id'] || null;

  try {
    await connectAdminDB();
    await Message.create({
      threadId: input.thread._id,
      senderType: input.senderRole,
      senderEmail:
        input.senderRole === 'founder'
          ? input.thread.founderEmail
          : input.senderRole === 'builder'
            ? input.recipientRole === 'founder'
              ? null
              : input.recipientEmail
            : null,
      recipientRole: input.recipientRole,
      direction: 'outbound',
      messageId: outboundMessageId,
      inReplyTo,
      references,
      sendgridMessageId,
      subject,
      body: text,
      text,
      html,
      source: input.source,
    });

    applyOutboundThreadState(input.thread, input.recipientRole, outboundMessageId, {
      emailSubject: input.emailSubject || input.thread.emailSubject || undefined,
      setRoot: input.setAsRoot,
    });

    if (input.recipientRole === 'founder' && input.thread.rootMessageId && input.thread.founderThreadState) {
      input.thread.founderThreadState.references = [
        ...new Set([
          ...(input.thread.founderThreadState.references || []),
          input.thread.rootMessageId,
          outboundMessageId,
        ]),
      ].slice(-20);
      input.thread.markModified?.('founderThreadState');
    }

    await input.thread.save();

    await TalentEmailDelivery.create({
      to: input.recipientEmail,
      from: FROM_EMAIL,
      subject,
      emailType: 'thread_relay',
      threadId,
      introRequestId: tracking.introRequestId || null,
      matchRecordId: tracking.matchRecordId || null,
      opportunityId: tracking.opportunityId || null,
      builderId: tracking.builderId || null,
      founderEmail: tracking.founderEmail || null,
      providerMessageId: sendgridMessageId,
      metadata: { ...tracking.metadata, rfcMessageId: outboundMessageId, source: input.source },
    });
  } catch (error) {
    console.error('[threadRelay] persist failed', error);
  }

  return { sent: true, messageId: outboundMessageId };
}

export async function sendTalentEmail(params: {
  to: string;
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  emailType?: string;
  replyTo?: string;
  tracking?: {
    threadId?: string | null;
    introRequestId?: string | null;
    matchRecordId?: string | null;
    opportunityId?: string | null;
    builderId?: string | null;
    founderEmail?: string | null;
    metadata?: Record<string, unknown>;
  };
}) {
  if (!EMAIL_ENABLED) {
    console.log('[talentEmail] skipped (dev mode or disabled)', params.subject, '→', params.to);
    return { sent: false, reason: 'disabled' };
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[talentEmail] missing SENDGRID_API_KEY');
    return { sent: false, reason: 'no_credentials' };
  }
  sgMail.setApiKey(apiKey);

  const html = renderTalentNotificationHtml({
    subject: params.subject,
    body: params.body,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
  });

  const emailType = params.emailType || 'talent_notification';
  const tracking = params.tracking || {};
  const customArgs: Record<string, string> = {
    emailType,
    ...(tracking.threadId ? { threadId: tracking.threadId } : {}),
    ...(tracking.introRequestId ? { introRequestId: tracking.introRequestId } : {}),
    ...(tracking.matchRecordId ? { matchRecordId: tracking.matchRecordId } : {}),
    ...(tracking.opportunityId ? { opportunityId: tracking.opportunityId } : {}),
    ...(tracking.builderId ? { builderId: tracking.builderId } : {}),
    ...(tracking.founderEmail ? { founderEmail: tracking.founderEmail } : {}),
  };

  const [response] = await sgMail.send({
    from: { email: FROM_EMAIL, name: 'DevLabs' },
    to: params.to,
    replyTo: params.replyTo || FROM_EMAIL,
    subject: params.subject,
    html,
    text: `${params.body}\n\n${params.ctaUrl ? `${params.ctaLabel || 'Open dashboard'}: ${params.ctaUrl}` : ''}`,
    categories: ['talent', emailType].slice(0, 10),
    customArgs,
    trackingSettings: {
      clickTracking: { enable: true, enableText: true },
      openTracking: { enable: true },
      subscriptionTracking: { enable: false },
    },
  });

  try {
    await connectAdminDB();
    await TalentEmailDelivery.create({
      to: params.to,
      from: FROM_EMAIL,
      subject: params.subject,
      emailType,
      threadId: tracking.threadId || null,
      introRequestId: tracking.introRequestId || null,
      matchRecordId: tracking.matchRecordId || null,
      opportunityId: tracking.opportunityId || null,
      builderId: tracking.builderId || null,
      founderEmail: tracking.founderEmail || null,
      providerMessageId: response.headers?.['x-message-id'] || null,
      metadata: tracking.metadata || {},
    });
  } catch (error) {
    console.error('[talentEmail] delivery record failed', error);
  }

  return { sent: true };
}

export function dashboardDeepLink(tab: string, origin = process.env.WEBSITE_ROOT || 'http://localhost:4321') {
  const base = origin.replace(/\/$/, '');
  return `${base}/dashboard?tab=${encodeURIComponent(tab)}`;
}
