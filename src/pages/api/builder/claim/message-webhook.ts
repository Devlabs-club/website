import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { advanceClaimConversation } from '@/lib/builderClaim';
import { readEnv, runtimeEnvFromLocals } from '@/lib/workosEnv';
import {
  parseBlueBubblesAttachments,
  looksLikeResume,
  downloadBlueBubblesAttachment,
} from '@/lib/messaging/bluebubblesAttachments';
import { resumeBytesToText } from '@/lib/talent/builderResumeExtract';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const expectedSecret = readEnv('BUILDER_CLAIM_INBOUND_WEBHOOK_SECRET', runtime);
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('password');
  const blueBubblesPassword = readEnv('BLUEBUBBLES_PASSWORD', runtime);
  if (expectedSecret || blueBubblesPassword) {
    const auth = request.headers.get('Authorization') || '';
    const authorized =
      (expectedSecret && (auth === `Bearer ${expectedSecret}` || querySecret === expectedSecret)) ||
      (blueBubblesPassword && querySecret === blueBubblesPassword);
    if (!authorized) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    from?: string;
    fromPhone?: string;
    body?: string;
    text?: string;
    messageId?: string;
    id?: string;
    type?: string;
    event?: string;
    isFromMe?: boolean;
    isFromMeString?: string;
    data?: {
      text?: string;
      guid?: string;
      isFromMe?: boolean;
      isFromMeString?: string;
      handle?: { address?: string };
      attachments?: Array<{ guid?: string; id?: string; mimeType?: string; uti?: string; transferName?: string; name?: string }>;
      chats?: Array<{
        participants?: Array<{ address?: string }>;
      }>;
    };
    attachments?: Array<{ guid?: string; id?: string; mimeType?: string; uti?: string; transferName?: string; name?: string }>;
  };
  const eventType = String(body.event || body.type || '');
  const isFromMe =
    body.isFromMe === true ||
    body.data?.isFromMe === true ||
    body.isFromMeString === '1' ||
    body.data?.isFromMeString === '1';
  if (isFromMe || eventType === 'message-send-error') {
    return json({ success: true, ignored: true });
  }

  const blueBubblesPhone =
    body.data?.handle?.address ||
    body.data?.chats?.[0]?.participants?.find((participant) => participant.address)?.address ||
    '';
  const fromPhone = String(body.fromPhone || body.from || blueBubblesPhone || '');
  const text = String(body.body || body.text || body.data?.text || '');
  const messageId = body.messageId || body.id || body.data?.guid || null;

  // Pull a resume out of any attachment the builder sent (PDF / text).
  let resumeText: string | null = null;
  const attachments = parseBlueBubblesAttachments(body.data || body);
  const resumeAttachment = attachments.find(looksLikeResume);
  if (resumeAttachment) {
    try {
      const file = await downloadBlueBubblesAttachment(resumeAttachment.guid, runtime);
      if (file) {
        resumeText = await resumeBytesToText(file.buffer, file.contentType || resumeAttachment.mimeType, resumeAttachment.transferName);
      }
    } catch (err) {
      console.warn('[claim/message-webhook] resume attachment processing failed', err);
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
