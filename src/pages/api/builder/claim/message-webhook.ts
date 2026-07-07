import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { advanceClaimConversation } from '@/lib/builderClaim';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { getImessageProvider, getImessageProviderName } from '@/lib/messaging/getProvider';
import {
  parseBlueBubblesAttachments,
  looksLikeResume,
} from '@/lib/messaging/bluebubblesAttachments';
import {
  downloadAgentPhoneMedia,
  looksLikeResumeAttachment,
} from '@/lib/messaging/agentPhoneAttachments';
import { parseAgentPhoneInbound } from '@/lib/messaging/agentPhoneClient';
import { processBlueBubblesResumeAttachment, processResumeBytes } from '@/lib/messaging/inboundResume';
import type { ResumeInbound } from '@/lib/messaging/inboundResume';
import {
  pendingResumeFromAttachment,
  stashPendingResumeAttachment,
  clearPendingResumeAttachment,
  resolvePendingResumeAttachment,
  looksLikeResumeIntent,
  phoneFromBlueBubblesBody,
} from '@/lib/messaging/pendingResumeAttachment';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Inbound webhook for builder iMessage/SMS conversations.
 * Provider is selected via IMESSAGE_PROVIDER (bluebubbles | agentphone).
 *
 * BlueBubbles: Settings → API & Webhooks → `https://<domain>/api/imessage/webhook?password=<BLUEBUBBLES_PASSWORD>`
 * AgentPhone: dashboard → `https://<domain>/api/builder/claim/message-webhook`
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const rawBody = await request.text();
  const url = new URL(request.url);

  let body: unknown = {};
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const provider = getImessageProvider(runtime);
  if (
    !provider.verifyInbound({
      searchParams: url.searchParams,
      headers: request.headers,
      rawBody: body,
    })
  ) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const providerName = getImessageProviderName(runtime);
  let fromPhone = '';
  let text = '';
  let messageId: string | null = null;
  let resumeText: string | null = null;
  let resumeExtracted: Record<string, unknown> | null = null;
  let resumePdf: import('@/lib/messaging/inboundResume').InboundResumePdf | null = null;
  let resumeInbound: ResumeInbound | null = null;

  if (providerName === 'bluebubbles') {
    const attachments = parseBlueBubblesAttachments(body);
    const resumeAttachment = attachments.find(looksLikeResume);
    const earlyPhone = phoneFromBlueBubblesBody(body);
    if (resumeAttachment && earlyPhone) {
      await connectAdminDB();
      await stashPendingResumeAttachment(earlyPhone, pendingResumeFromAttachment(resumeAttachment));
    }

    const inbound = provider.parseInbound(body);
    if (!inbound) return json({ success: true, ignored: true });

    fromPhone = inbound.handle;
    text = inbound.text === '(attachment)' ? '' : inbound.text;
    messageId = inbound.providerMessageGuid;

    if (resumeAttachment) {
      resumeInbound = await processBlueBubblesResumeAttachment(resumeAttachment, runtime);
      if (resumeInbound.status === 'parsed') {
        resumeText = resumeInbound.text;
        resumeExtracted = resumeInbound.extracted as Record<string, unknown>;
        resumePdf = resumeInbound.pdf;
        await clearPendingResumeAttachment(fromPhone);
      } else {
        console.warn('[claim/message-webhook] resume attachment processing failed', resumeInbound);
      }
    }
  } else {
    const parsed = parseAgentPhoneInbound(body);
    if (!parsed) return json({ success: true, ignored: true });

    fromPhone = parsed.fromPhone;
    text = parsed.text;
    messageId =
      request.headers.get('X-Webhook-ID') ||
      request.headers.get('x-webhook-id') ||
      parsed.messageId;

    if (parsed.mediaUrl && looksLikeResumeAttachment(null, parsed.mediaUrl)) {
      try {
        const file = await downloadAgentPhoneMedia(parsed.mediaUrl);
        if (file) {
          resumeInbound = await processResumeBytes(file.buffer, file.contentType, parsed.mediaUrl);
          if (resumeInbound.status === 'parsed') {
            resumeText = resumeInbound.text;
            resumeExtracted = resumeInbound.extracted as Record<string, unknown>;
            resumePdf = resumeInbound.pdf;
          } else {
            console.warn('[claim/message-webhook] resume attachment processing failed', resumeInbound);
          }
        } else {
          resumeInbound = { status: 'download_failed', fileName: parsed.mediaUrl, error: 'Could not download media URL.' };
        }
      } catch (err) {
        resumeInbound = {
          status: 'download_failed',
          fileName: parsed.mediaUrl,
          error: err instanceof Error ? err.message : 'download error',
        };
        console.warn('[claim/message-webhook] resume attachment processing failed', err);
      }
    }
  }

  const resumeAttachmentLabel =
    resumeInbound && resumeInbound.status !== 'parsed'
      ? `(sent a resume PDF${resumeInbound.fileName ? `: ${resumeInbound.fileName}` : ''})`
      : resumeText
        ? '(sent a resume)'
        : null;

  if (!fromPhone || (!text.trim() && !resumeText && !resumeAttachmentLabel)) {
    return json({ success: false, error: 'fromPhone and body (or a resume attachment) are required.' }, 400);
  }

  await connectAdminDB();

  // Pair caption-only follow-ups ("this is my resume") with a PDF from a prior webhook.
  if (!resumeText && (looksLikeResumeIntent(text) || resumeAttachmentLabel)) {
    const pending = await resolvePendingResumeAttachment(fromPhone, runtime);
    if (pending.resumeText) {
      resumeText = pending.resumeText;
      resumeExtracted = pending.resumeExtracted;
      resumePdf = pending.resumePdf;
      resumeInbound = pending.resumeInbound;
      console.log('[claim/message-webhook] paired text with pending resume PDF');
    } else if (!resumeInbound && pending.resumeInbound) {
      resumeInbound = pending.resumeInbound;
    }
  }

  const result = await advanceClaimConversation(
    {
      fromPhone,
      body: text.trim() || resumeAttachmentLabel || '(sent a resume)',
      providerMessageId: messageId,
      resumeText,
      resumeExtracted,
      resumePdf,
      resumeInbound,
    },
    runtime
  );
  if ('error' in result) return json({ success: false, error: result.error }, result.status);

  return json({
    success: true,
    completed: result.completed,
    delivery: result.delivery,
  });
};

export const prerender = false;
