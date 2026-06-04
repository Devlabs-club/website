import type { APIRoute } from 'astro';
import { proxyToNodeBackend, shouldUseApiProxy } from '@/lib/apiProxy';

export const GET: APIRoute = async (context) => {
  if (shouldUseApiProxy(context.locals)) {
    return proxyToNodeBackend(context.request, context.locals);
  }
  const { getTalentRealtime } = await import('@/lib/talent/realtimeHandler');
  return getTalentRealtime(context);
};
