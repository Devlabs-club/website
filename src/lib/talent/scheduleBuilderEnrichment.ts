import { waitUntil } from '@vercel/functions';
import type { RuntimeEnv } from '@/lib/workosEnv';
import type { EnrichmentSource } from '@/lib/talent/builderEnrichment/types';

export type ScheduleBuilderEnrichmentParams = {
  builderId: string;
  builderEmail: string;
  sources: EnrichmentSource[];
  research?: boolean;
  runtime?: RuntimeEnv;
  /**
   * Absolute site origin used to invoke `/api/internal/enrich-builder` as a
   * separate Vercel function (its own 300s budget). Falls back to same-process
   * waitUntil when unavailable.
   */
  origin?: string | null;
};

function resolveOrigin(explicit?: string | null): string | null {
  const candidates = [
    explicit,
    process.env.WEBSITE_ROOT,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
  ];
  for (const value of candidates) {
    const trimmed = typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
    if (trimmed) return trimmed;
  }
  return null;
}

async function runPipelineInProcess(params: ScheduleBuilderEnrichmentParams) {
  await import('@/lib/workerPolyfills');
  const { runEnrichmentPipeline } = await import('@/lib/talent/builderEnrichment/orchestrator');
  const { clearEnrichmentProgress } = await import('@/lib/talent/builderEnrichment/progress');
  try {
    await runEnrichmentPipeline({
      builderId: params.builderId,
      memRef: { builderId: params.builderId, builderEmail: params.builderEmail },
      sources: params.sources,
      research: params.research ?? false,
      runtime: params.runtime,
      deferExperiences: false,
    });
  } catch (error) {
    console.error('[scheduleBuilderEnrichment] pipeline failed', {
      builderId: params.builderId,
      error,
    });
    await clearEnrichmentProgress(params.builderId).catch(() => {});
  }
}

/**
 * Keep builder enrichment alive after the HTTP response is sent.
 *
 * Bug this fixes: `void runEnrichmentPipeline(...)` is killed by Vercel as soon
 * as the profile API returns, leaving `enrichmentInsights.activeProgress` stuck
 * (e.g. forever on "Scanning GitHub").
 *
 * Strategy:
 * 1. Prefer a dedicated internal function invoke (separate maxDuration budget).
 * 2. Always wrap with `waitUntil` so the runtime does not freeze mid-flight.
 * 3. Fall back to same-process pipeline when internal secret/origin is missing.
 */
export function scheduleBuilderEnrichment(params: ScheduleBuilderEnrichmentParams): {
  mode: 'internal_invoke' | 'in_process';
} {
  const secret = process.env.ENRICHMENT_INTERNAL_SECRET?.trim();
  const origin = resolveOrigin(params.origin);

  if (secret && origin) {
    const task = fetch(`${origin}/api/internal/enrich-builder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        builderId: params.builderId,
        sources: params.sources,
        research: params.research ?? false,
        builderEmail: params.builderEmail,
      }),
      // Detached enrichment can take several minutes.
      signal: AbortSignal.timeout(290_000),
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          console.error('[scheduleBuilderEnrichment] internal invoke failed', {
            builderId: params.builderId,
            status: res.status,
            detail: detail.slice(0, 300),
          });
          // Fall back so a misconfigured internal route does not strand progress.
          await runPipelineInProcess(params);
        }
      })
      .catch(async (error) => {
        console.error('[scheduleBuilderEnrichment] internal invoke error', {
          builderId: params.builderId,
          error: error instanceof Error ? error.message : error,
        });
        await runPipelineInProcess(params);
      });

    waitUntil(task);
    return { mode: 'internal_invoke' };
  }

  waitUntil(runPipelineInProcess(params));
  return { mode: 'in_process' };
}
