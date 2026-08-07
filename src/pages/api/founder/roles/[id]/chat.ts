import type { APIRoute } from 'astro';
import {
  errorJson,
  okJson,
  resolveFounderIdentity,
  runFounderAgentChat,
  getFounderAgentChatState,
} from '@/lib/founderAgent/service';

/** Load the saved session + chat history for a role so the workspace can resume the conversation. */
export const GET: APIRoute = async ({ request, locals, params }) => {
  try {
    const identity = await resolveFounderIdentity(request, locals);
    if ('error' in identity) return errorJson(identity.error, identity.status);
    if (!params.id) return errorJson('role id is required', 400);

    const state = await getFounderAgentChatState(identity, { jobId: params.id });
    return okJson({
      session: state.session,
      job: state.job,
      history: state.history,
    });
  } catch (error) {
    console.error('[founder/roles/chat:GET] failed', error);
    return errorJson(error instanceof Error ? error.message : 'Could not load role chat', 500);
  }
};

/** AI-assisted role edits from the new split-pane founder workspace. */
export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const identity = await resolveFounderIdentity(request, locals);
    if ('error' in identity) return errorJson(identity.error, identity.status);

    const body = await request.json().catch(() => ({}));
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) return errorJson('message is required', 400);

    const result = await runFounderAgentChat({
      identity,
      jobId: params.id || null,
      sessionId: body?.sessionId || null,
      message,
    });

    return okJson({
      message: result.message,
      session: result.session,
      job: result.job,
      history: result.history,
      searchRan: result.searchRan,
      shortlistChanged: result.shortlistChanged,
      searchNeedsFollowup: result.searchNeedsFollowup,
      meta: result.meta,
    });
  } catch (error) {
    console.error('[founder/roles/chat] failed', error);
    return errorJson(error instanceof Error ? error.message : 'Founder role chat failed', 500);
  }
};

export const prerender = false;
