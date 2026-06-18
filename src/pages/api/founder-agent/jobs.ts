import type { APIRoute } from 'astro';
import {
  errorJson,
  getFounderJobs,
  handleJobAction,
  okJson,
  resolveFounderIdentity,
} from '@/lib/founderAgent/service';

export const GET: APIRoute = async (context) => {
  try {
    const identity = await resolveFounderIdentity(context.request, context.locals);
    if ('error' in identity) return errorJson(identity.error, identity.status);
    return okJson(await getFounderJobs(identity));
  } catch (error) {
    console.error('[founder-agent/jobs] GET failed', error);
    return errorJson(error instanceof Error ? error.message : 'Failed to load jobs', 500);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const identity = await resolveFounderIdentity(context.request, context.locals);
    if ('error' in identity) return errorJson(identity.error, identity.status);
    const body = await context.request.json().catch(() => ({}));
    return okJson(await handleJobAction(identity, body));
  } catch (error) {
    console.error('[founder-agent/jobs] POST failed', error);
    return errorJson(error instanceof Error ? error.message : 'Job action failed', 500);
  }
};
