import type { APIRoute } from 'astro';
import { proxyToNodeBackend, shouldUseApiProxy } from '@/lib/apiProxy';

export const prerender = false;

function unauthorized() {
  return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function runEnrichment(builderId: string) {
  await import('@/lib/workerPolyfills');
  const { connectDB } = await import('@/lib/mongodb');
  const { enrichBuilderProfile } = await import('@/lib/talent/builderEnrichment');
  await connectDB();
  return enrichBuilderProfile({
    builderId,
    sources: ['resume', 'github', 'devpost', 'linkedin', 'portfolio'],
    dryRun: false,
  });
}

export const POST: APIRoute = async (context) => {
  if (shouldUseApiProxy(context.locals)) {
    return proxyToNodeBackend(context.request, context.locals);
  }

  const { request } = context;
  const secret = process.env.ENRICHMENT_INTERNAL_SECRET?.trim();
  if (!secret) {
    return new Response(JSON.stringify({ success: false, message: 'Not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${secret}`) return unauthorized();

  let body: { builderId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const builderId = body.builderId?.trim();
  if (!builderId) {
    return new Response(JSON.stringify({ success: false, message: 'builderId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await runEnrichment(builderId);
    return new Response(JSON.stringify({ success: true, accepted: false, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[internal/enrich-builder] failed', builderId, err);
    return new Response(
      JSON.stringify({
        success: false,
        message: err instanceof Error ? err.message : 'enrichment_failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
