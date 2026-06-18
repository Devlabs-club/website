import type { APIRoute } from 'astro';
import {
  errorJson,
  getFounderDashboard,
  okJson,
  resolveFounderIdentity,
} from '@/lib/founderAgent/service';

export const GET: APIRoute = async (context) => {
  try {
    const identity = await resolveFounderIdentity(context.request, context.locals);
    if ('error' in identity) return errorJson(identity.error, identity.status);
    return okJson(await getFounderDashboard(identity));
  } catch (error) {
    console.error('[founder-agent/dashboard] GET failed', error);
    return errorJson(error instanceof Error ? error.message : 'Failed to load dashboard', 500);
  }
};
