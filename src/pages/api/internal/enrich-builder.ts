import type { APIRoute } from 'astro';
import { proxyToNodeBackend, shouldUseApiProxy } from '@/lib/apiProxy';
import { notifyOps } from '@/lib/opsTelegram';
import type { EnrichmentSource } from '@/lib/talent/builderEnrichment/types';

export const prerender = false;

function unauthorized() {
  return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ALLOWED_SOURCES: EnrichmentSource[] = [
  'resume',
  'github',
  'devpost',
  'linkedin',
  'portfolio',
  'twitter',
];

function parseSources(raw: unknown): EnrichmentSource[] {
  if (!Array.isArray(raw)) return ['linkedin', 'github', 'portfolio', 'resume'];
  const sources = raw
    .map(String)
    .filter((s): s is EnrichmentSource => ALLOWED_SOURCES.includes(s as EnrichmentSource));
  return sources.length ? [...new Set(sources)] : ['linkedin', 'github', 'portfolio', 'resume'];
}

async function runEnrichment(params: {
  builderId: string;
  builderEmail?: string;
  sources: EnrichmentSource[];
  research: boolean;
}) {
  await import('@/lib/workerPolyfills');
  const { connectDB } = await import('@/lib/mongodb');
  const { runEnrichmentPipeline } = await import('@/lib/talent/builderEnrichment/orchestrator');
  const BuilderProfile = (await import('@/models/talent/BuilderProfile')).default;
  await connectDB();

  const builder = await BuilderProfile.findById(params.builderId).select('email name').lean();
  const email =
    params.builderEmail?.trim() ||
    (builder && typeof (builder as any).email === 'string' ? String((builder as any).email) : '');

  return {
    result: await runEnrichmentPipeline({
      builderId: params.builderId,
      memRef: { builderId: params.builderId, builderEmail: email },
      sources: params.sources,
      research: params.research,
      deferExperiences: false,
    }),
  };
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

  let body: {
    builderId?: string;
    builderEmail?: string;
    sources?: string[];
    research?: boolean;
  };
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

  const sources = parseSources(body.sources);
  const research = body.research !== false;

  try {
    const { result } = await runEnrichment({
      builderId,
      builderEmail: body.builderEmail,
      sources,
      research,
    });
    return new Response(JSON.stringify({ success: true, accepted: false, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[internal/enrich-builder] failed', builderId, err);
    const message = err instanceof Error ? err.message : 'enrichment_failed';
    notifyOps({
      event: /timed?\s*out/i.test(message) ? 'enrichment_timeout' : 'enrichment_failed',
      title: `Builder Enrichment failed for ${builderId}`,
      severity: 'error',
      body: message.slice(0, 500),
    });
    const { clearEnrichmentProgress } = await import('@/lib/talent/builderEnrichment/progress');
    await clearEnrichmentProgress(builderId).catch(() => {});
    return new Response(
      JSON.stringify({
        success: false,
        message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
