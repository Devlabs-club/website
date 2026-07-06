import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { advanceClaimConversation } from '@/lib/builderClaim';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { getImessageProvider, getImessageProviderName } from '@/lib/messaging/getProvider';
import {
  parseBlueBubblesAttachments,
  looksLikeResume,
  downloadBlueBubblesAttachment,
} from '@/lib/messaging/bluebubblesAttachments';
import {
  downloadAgentPhoneMedia,
  looksLikeResumeAttachment,
} from '@/lib/messaging/agentPhoneAttachments';
import { parseAgentPhoneInbound } from '@/lib/messaging/agentPhoneClient';
import { parseResumeAttachment } from '@/lib/talent/builderResumeExtract';

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

  if (providerName === 'bluebubbles') {
    const inbound = provider.parseInbound(body);
    if (!inbound) return json({ success: true, ignored: true });

    fromPhone = inbound.handle;
    text = inbound.text === '(attachment)' ? '' : inbound.text;
    messageId = inbound.providerMessageGuid;

    const attachments = parseBlueBubblesAttachments(body);
    const resumeAttachment = attachments.find(looksLikeResume);
    if (resumeAttachment) {
      try {
        const file = await downloadBlueBubblesAttachment(resumeAttachment.guid, runtime);
        if (file) {
          const parsed = await parseResumeAttachment(
            file.buffer,
            file.contentType || resumeAttachment.mimeType,
            resumeAttachment.transferName
          );
          resumeText = parsed.text;
          resumeExtracted = parsed.extracted as Record<string, unknown>;
        }
      } catch (err) {
        console.warn('[claim/message-webhook] resume attachment processing failed', err);
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
          const parsedResume = await parseResumeAttachment(file.buffer, file.contentType, parsed.mediaUrl);
          resumeText = parsedResume.text;
          resumeExtracted = parsedResume.extracted as Record<string, unknown>;
        }
      } catch (err) {
        console.warn('[claim/message-webhook] resume attachment processing failed', err);
      }
    }
  }

  if (!fromPhone || (!text.trim() && !resumeText)) {
    return json({ success: false, error: 'fromPhone and body (or a resume attachment) are required.' }, 400);
  }

  await connectAdminDB();
  const result = await advanceClaimConversation(
    {
      fromPhone,
      body: text.trim() || '(sent a resume)',
      providerMessageId: messageId,
      resumeText,
      resumeExtracted,
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
