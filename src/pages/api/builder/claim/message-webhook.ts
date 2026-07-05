import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { advanceClaimConversation } from '@/lib/builderClaim';
import { readEnv, runtimeEnvFromLocals } from '@/lib/workosEnv';
import {
  getAgentPhoneConfig,
  parseAgentPhoneInbound,
  verifyAgentPhoneWebhook,
} from '@/lib/messaging/agentPhoneClient';
import {
  downloadAgentPhoneMedia,
  looksLikeResumeAttachment,
} from '@/lib/messaging/agentPhoneAttachments';
import { resumeBytesToText } from '@/lib/talent/builderResumeExtract';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Inbound webhook for AgentPhone (SMS/MMS/iMessage).
 * Configure in AgentPhone dashboard → Webhooks:
 *   https://<your-domain>/api/builder/claim/message-webhook
 * Also reachable at /api/imessage/webhook (legacy alias).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const rawBody = await request.text();

  const config = getAgentPhoneConfig(runtime);
  const legacySecret = readEnv('BUILDER_CLAIM_INBOUND_WEBHOOK_SECRET', runtime);

  let body: unknown = {};
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const webhookId =
    request.headers.get('X-Webhook-ID') ||
    request.headers.get('x-webhook-id') ||
    null;

  if (config?.webhookSecret) {
    if (!verifyAgentPhoneWebhook(rawBody, request.headers, config.webhookSecret)) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
  } else if (legacySecret) {
    const auth = request.headers.get('Authorization') || '';
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('secret');
    const authorized = auth === `Bearer ${legacySecret}` || querySecret === legacySecret;
    if (!authorized) return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const parsed = parseAgentPhoneInbound(body);
  if (!parsed) {
    return json({ success: true, ignored: true });
  }

  let resumeText: string | null = null;
  if (parsed.mediaUrl && looksLikeResumeAttachment(null, parsed.mediaUrl)) {
    try {
      const file = await downloadAgentPhoneMedia(parsed.mediaUrl);
      if (file) {
        resumeText = await resumeBytesToText(file.buffer, file.contentType, parsed.mediaUrl);
      }
    } catch (err) {
      console.warn('[claim/message-webhook] resume attachment processing failed', err);
    }
  }

  const messageId = webhookId || parsed.messageId;

  await connectAdminDB();
  const result = await advanceClaimConversation(
    {
      fromPhone: parsed.fromPhone,
      body: parsed.text.trim() || '(sent a resume)',
      providerMessageId: messageId,
      resumeText,
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
