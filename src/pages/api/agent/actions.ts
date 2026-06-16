import type { APIRoute } from 'astro';
import { proxyToNodeBackend, shouldUseApiProxy } from '@/lib/apiProxy';

export const POST: APIRoute = async (context) => {
  if (shouldUseApiProxy(context.locals)) {
    return proxyToNodeBackend(context.request, context.locals);
  }
  try {
    const { postAgentAction } = await import('@/lib/agent/actionsHandler');
    return postAgentAction(context);
  } catch (error) {
    console.error('[agent/actions] handler import failed', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load agent handler',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
