import type { APIRoute } from 'astro';
import { proxyToNodeBackend, shouldUseApiProxy } from '@/lib/apiProxy';
import {
  runEnrichmentProbe,
  runEnrichmentProbeBatch,
  SAMPLE_PROBE_PROFILES,
  type EnrichmentProbeRequest,
} from '@/lib/talent/builderEnrichment/probe';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return json({ success: false, message: 'Unauthorized' }, 401);
}

const VALID_SOURCES = new Set([
  'github',
  'linkedin',
  'devpost',
  'resume',
  'portfolio',
  'twitter',
  'generic_link',
]);

/**
 * Dry-run enrichment probes — no builder DB writes.
 *
 * POST /api/internal/enrichment-probe
 * Authorization: Bearer $ENRICHMENT_INTERNAL_SECRET
 *
 * Single probe:
 * { "source": "github", "githubUsername": "dhanush17-tech", "name": "Dhanush", "audit": true }
 *
 * Batch:
 * { "probes": [ { "source": "github", ... }, { "source": "linkedin", "url": "..." } ] }
 *
 * Sample presets:
 * { "sample": "github_dhanush" } | { "sample": "all" }
 */
export const POST: APIRoute = async (context) => {
  if (shouldUseApiProxy(context.locals)) {
    return proxyToNodeBackend(context.request, context.locals);
  }

  const secret = process.env.ENRICHMENT_INTERNAL_SECRET?.trim();
  if (!secret) {
    return json({ success: false, message: 'ENRICHMENT_INTERNAL_SECRET not configured' }, 503);
  }

  const auth = context.request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${secret}`) return unauthorized();

  let body: {
    source?: string;
    probes?: EnrichmentProbeRequest[];
    sample?: keyof typeof SAMPLE_PROBE_PROFILES | 'all';
    name?: string;
    url?: string;
    githubUsername?: string;
    audit?: boolean;
  };

  try {
    body = await context.request.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON' }, 400);
  }

  await import('@/lib/workerPolyfills');

  if (body.sample === 'all') {
    const probes = Object.values(SAMPLE_PROBE_PROFILES);
    const batch = await runEnrichmentProbeBatch(probes);
    return json({ success: true, dryRun: true, ...batch });
  }

  if (body.sample && body.sample in SAMPLE_PROBE_PROFILES) {
    const result = await runEnrichmentProbe(SAMPLE_PROBE_PROFILES[body.sample as keyof typeof SAMPLE_PROBE_PROFILES]);
    return json({ success: true, result });
  }

  if (Array.isArray(body.probes) && body.probes.length) {
    for (const probe of body.probes) {
      if (!probe?.source || !VALID_SOURCES.has(probe.source)) {
        return json({ success: false, message: `Invalid probe source: ${probe?.source}` }, 400);
      }
    }
    const batch = await runEnrichmentProbeBatch(body.probes);
    return json({ success: true, dryRun: true, ...batch });
  }

  const source = body.source?.trim();
  if (!source || !VALID_SOURCES.has(source)) {
    return json(
      {
        success: false,
        message: 'source required (github|linkedin|devpost|resume|portfolio|twitter|generic_link)',
        samples: Object.keys(SAMPLE_PROBE_PROFILES),
      },
      400
    );
  }

  const result = await runEnrichmentProbe({
    source: source as EnrichmentProbeRequest['source'],
    name: body.name,
    url: body.url,
    githubUsername: body.githubUsername,
    audit: body.audit,
  });

  return json({ success: true, result });
};

export const GET: APIRoute = async (context) => {
  if (shouldUseApiProxy(context.locals)) {
    return proxyToNodeBackend(context.request, context.locals);
  }

  return json({
    success: true,
    dryRun: true,
    description: 'POST with Bearer ENRICHMENT_INTERNAL_SECRET to run enrichment probes without DB writes.',
    sources: [...VALID_SOURCES],
    samples: SAMPLE_PROBE_PROFILES,
    examples: {
      github: {
        source: 'github',
        githubUsername: 'dhanush17-tech',
        name: 'Dhanush Vardhan',
        audit: true,
      },
      linkedin: {
        source: 'linkedin',
        url: 'https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/',
      },
      devpost: { source: 'devpost', url: 'https://devpost.com/software/your-project' },
      resume: { source: 'resume', url: 'https://example.com/resume.pdf' },
      portfolio: { source: 'portfolio', url: 'https://yoursite.dev' },
      twitter: { source: 'twitter', url: 'https://x.com/handle' },
      generic_link: { source: 'generic_link', url: 'https://example.com/blog/post' },
      batch: {
        probes: [
          { source: 'github', githubUsername: 'dhanush17-tech', audit: true },
          { source: 'linkedin', url: 'https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/' },
        ],
      },
    },
  });
};
