import type { APIRoute } from 'astro';
import {
  errorJson,
  getFounderAgentChatState,
  okJson,
  resolveFounderIdentity,
  runFounderAgentChat,
} from '@/lib/founderAgent/service';

export const GET: APIRoute = async (context) => {
  try {
    const identity = await resolveFounderIdentity(context.request, context.locals);
    if ('error' in identity) return errorJson(identity.error, identity.status);

    const sessionId = context.url.searchParams.get('sessionId');
    const jobId = context.url.searchParams.get('jobId');
    const state = await getFounderAgentChatState(identity, { sessionId, jobId });
    return okJson(state);
  } catch (error) {
    console.error('[founder-agent/chat] GET failed', error);
    return errorJson(error instanceof Error ? error.message : 'Failed to load founder chat', 500);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const identity = await resolveFounderIdentity(context.request, context.locals);
    if ('error' in identity) return errorJson(identity.error, identity.status);

    const body = await context.request.json().catch(() => ({}));
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) return errorJson('message is required', 400);

    const result = await runFounderAgentChat({
      identity,
      sessionId: body?.sessionId || null,
      jobId: body?.jobId || null,
      message,
    });
    return okJson(result);
  } catch (error) {
    console.error('[founder-agent/chat] POST failed', error);
    return errorJson(error instanceof Error ? error.message : 'Founder agent failed', 500);
  }
};
