import type { RuntimeEnv } from '@/lib/workosEnv';
import type { MemoryRef } from '@/lib/talent/builderAgentMemory';
import { rememberBuilderFact } from '@/lib/talent/builderAgentMemory';
import { enrichBuilderProfile, type EnrichmentSource } from '@/lib/talent/builderEnrichment';
import { aggregateInferredSkills } from '@/lib/talent/builderEnrichment/apply';
import { persistEnrichmentContext } from '@/lib/talent/builderEnrichment/enrichmentInsights';
import { deepResearchBuilder, type DeepResearchResult } from '@/lib/talent/builderDeepResearch';
import { processGenericLink } from '@/lib/talent/builderLinkProcessor';
import { reloadBuilder, getProjects, updateBuilderScores, updateLinks } from '@/lib/agent/builderProfileTools';
import {
  clearEnrichmentProgress,
  initialUiStageForSources,
  setEnrichmentProgress,
  touchEnrichmentProgress,
  uiStageForSource,
  type EnrichmentUiStage,
} from '@/lib/talent/builderEnrichment/progress';
import type { SourceEnrichmentResult } from './types';
import { notifyOps, opsPersonFrom, watchOpsDuration } from '@/lib/opsTelegram';

export type EnrichmentPlan = {
  sources: EnrichmentSource[];
  research: boolean;
  genericLinks: string[];
  reasons: string[];
};

export type PublicProfileReadiness = {
  ready: boolean;
  score: number;
  blockers: string[];
  recommendedSources: EnrichmentSource[];
  highlightsCount: number;
  completedSources: EnrichmentSource[];
};

const SOURCE_ORDER: EnrichmentSource[] = ['linkedin', 'github', 'devpost', 'portfolio', 'twitter', 'resume'];

async function reportSourceProgress(builderId: string, source: EnrichmentSource, sources: EnrichmentSource[]) {
  const stage = uiStageForSource(source);
  if (stage) {
    await setEnrichmentProgress(builderId, stage);
    return;
  }
  const githubIndex = sources.indexOf('github');
  const sourceIndex = sources.indexOf(source);
  if (githubIndex >= 0 && sourceIndex > githubIndex) {
    await setEnrichmentProgress(builderId, 'github');
    return;
  }
  if (sources.includes('linkedin') && sourceIndex > sources.indexOf('linkedin')) {
    await setEnrichmentProgress(builderId, 'linkedin');
    return;
  }
  await touchEnrichmentProgress(builderId);
}

function getCompletedSources(builder: any): EnrichmentSource[] {
  const raw = builder?.enrichmentInsights?.sourcesCompleted;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row: any) => row?.source)
    .filter((s: unknown): s is EnrichmentSource => typeof s === 'string' && SOURCE_ORDER.includes(s as EnrichmentSource));
}

function linkForSource(builder: any, source: EnrichmentSource): string | null {
  const links = builder?.links || {};
  if (source === 'portfolio') return links.portfolio || links.personalWebsite || null;
  if (source === 'resume') return links.resume || null;
  return links[source] || null;
}

function sourceForLinkField(field: string): EnrichmentSource | null {
  if (field === 'personalWebsite') return 'portfolio';
  if (SOURCE_ORDER.includes(field as EnrichmentSource)) return field as EnrichmentSource;
  return null;
}

/** Decide which enrichment sources still need to run for this builder. */
export function planEnrichment(builder: any, opts?: { includeCompleted?: boolean }): EnrichmentPlan {
  const completed = new Set(getCompletedSources(builder));
  const sources: EnrichmentSource[] = [];
  const reasons: string[] = [];

  for (const source of SOURCE_ORDER) {
    const url = linkForSource(builder, source);
    if (!url) continue;
    if (!opts?.includeCompleted && completed.has(source)) continue;
    sources.push(source);
    reasons.push(`${source}: link present${completed.has(source) ? ' (re-run)' : ''}`);
  }

  const research =
    sources.length > 0 ||
    (!completed.has('github' as EnrichmentSource) && Boolean(builder?.links?.github)) ||
    reasons.length >= 2;

  return { sources, research, genericLinks: [], reasons };
}

export function assessPublicProfileReadiness(builder: any, projects: any[]): PublicProfileReadiness {
  const completedSources = getCompletedSources(builder);
  const highlightsCount = (builder?.enrichmentInsights?.founderHighlights || []).length;
  const blockers: string[] = [];
  const recommendedSources = planEnrichment(builder).sources;

  const hasProofLink = Boolean(builder?.links?.github || builder?.links?.linkedin);
  const projectWithDesc = projects.filter((p) => String(p.description || '').trim().length > 20);
  const skills = (builder?.skills || []).length;
  const experiences = (builder?.experiences || []).length;
  const profileScore = builder?.profileCompletion?.profileScore ?? builder?.profileCompletion?.score ?? 0;

  if (!hasProofLink) blockers.push('missing GitHub or LinkedIn proof link');
  if (!String(builder?.headline || '').trim()) blockers.push('missing headline');
  if (!String(builder?.bio || '').trim()) blockers.push('missing bio');
  if (skills < 4) blockers.push('need at least 4 technical skills on profile');
  if (projectWithDesc.length < 1) blockers.push('need at least 1 project with a real description');
  if (experiences < 1 && projectWithDesc.length < 2) blockers.push('need work history or 2+ solid projects');
  if (!String(builder?.workAuthorization || '').trim()) blockers.push('missing work authorization / visa status');
  if (highlightsCount < 1 && profileScore < 65) blockers.push('profile needs enrichment highlights or higher quality score');

  for (const source of recommendedSources) {
    blockers.push(`enrichment not run yet: ${source}`);
  }

  let score = 0;
  if (hasProofLink) score += 15;
  if (builder?.headline) score += 10;
  if (builder?.bio) score += 15;
  if (skills >= 4) score += 10;
  if (skills >= 10) score += 5;
  if (projectWithDesc.length >= 1) score += 15;
  if (projectWithDesc.length >= 3) score += 5;
  if (experiences >= 1) score += 10;
  if (highlightsCount >= 2) score += 15;
  if (highlightsCount >= 4) score += 5;
  if (completedSources.length >= 2) score += 10;
  if (builder?.availability?.availableNow === true) score += 5;

  const ready = blockers.length === 0 && score >= 70;

  return {
    ready,
    score: Math.min(100, score),
    blockers,
    recommendedSources,
    highlightsCount,
    completedSources,
  };
}

async function markSourcesCompleted(builder: any, results: SourceEnrichmentResult[]) {
  builder.enrichmentInsights = builder.enrichmentInsights || {};
  const existing = Array.isArray(builder.enrichmentInsights.sourcesCompleted)
    ? builder.enrichmentInsights.sourcesCompleted
    : [];
  const bySource = new Map(existing.map((row: any) => [row.source, row]));

  for (const result of results) {
    if (result.errors?.length && !result.profile && !result.projects?.length) continue;
    bySource.set(result.source, {
      source: result.source,
      completedAt: new Date(),
      projectCount: result.projects?.length || 0,
      profileFields: result.profile ? Object.keys(result.profile).filter((k) => (result.profile as any)[k]) : [],
    });
  }

  builder.enrichmentInsights.sourcesCompleted = [...bySource.values()];
  builder.enrichmentInsights.updatedAt = new Date();
  await builder.save();
}

function formatEnrichmentNote(
  results: SourceEnrichmentResult[],
  researchSummary?: string,
  genericNotes?: string[]
): string {
  const parts: string[] = [];
  for (const r of results) {
    if (r.errors?.length && !r.profile && !r.projects?.length) {
      parts.push(`${r.source}: failed (${r.errors.join(', ')})`);
      continue;
    }
    const fields = r.profile
      ? ['headline', 'bio', 'skills', 'experiences', 'rolePreference'].filter((k) => (r.profile as any)?.[k])
      : [];
    parts.push(
      `${r.source}: ${r.projects?.length || 0} projects${fields.length ? `, profile: ${fields.join('+')}` : ''}`
    );
  }
  if (researchSummary) parts.push(`research: ${researchSummary.slice(0, 400)}`);
  if (genericNotes?.length) parts.push(...genericNotes);
  return parts.join('\n');
}

/** Run enrichment sources + optional research + generic links; persist memory + highlights. */
export async function runEnrichmentPipeline(params: {
  builderId: string;
  memRef: MemoryRef;
  sources?: EnrichmentSource[];
  research?: boolean;
  genericLinks?: string[];
  runtime?: RuntimeEnv;
  claim?: any;
  deferExperiences?: boolean;
}): Promise<{ note: string; results: SourceEnrichmentResult[]; readiness: PublicProfileReadiness }> {
  const builder = await reloadBuilder(params.builderId);
  if (!builder) throw new Error('Builder not found');

  const plan = planEnrichment(builder);
  const sources = params.sources?.length ? params.sources : plan.sources;
  const results: SourceEnrichmentResult[] = [];
  const builderLabel = opsPersonFrom(builder.name, builder.email);
  const slowWatch = watchOpsDuration({
    event: 'enrichment_slow',
    title: `Builder Enrichment still running for ${builderLabel}`,
    afterMs: 120_000,
  });

  try {
    if (sources.length) {
      await setEnrichmentProgress(params.builderId, initialUiStageForSources(sources));
      const res = await enrichBuilderProfile({
        builderId: params.builderId,
        sources,
        runtime: params.runtime,
        deferExperiences: params.deferExperiences,
        onSourceStart: (source) => reportSourceProgress(params.builderId, source, sources),
      });
      results.push(...res.sources);
    }

    const genericNotes: string[] = [];
    for (const url of (params.genericLinks || []).slice(0, 3)) {
    try {
      const r = await processGenericLink(builder, url, params.memRef);
      if (r.ok) genericNotes.push(`From ${url}: ${r.summary || r.coolFacts.join('; ')}`);
    } catch {
      genericNotes.push(`Couldn't read ${url}`);
    }
    }

    let researchSummary = '';
    let researchResult: DeepResearchResult | null = null;
    if (params.research !== false) {
      await setEnrichmentProgress(params.builderId, 'research');
      const projects = await getProjects(params.builderId);
    const research = await deepResearchBuilder({
      builder,
      projects,
      memRef: params.memRef,
      runtime: params.runtime,
    });
    researchResult = research;
    researchSummary = [research.summary, research.proofPoints.slice(0, 3).join(' | ')].filter(Boolean).join(' — ');
    const linkUpdates: Record<string, string> = {};
    if (research.discoveredLinks.devpost && !builder.links?.devpost) linkUpdates.devpost = research.discoveredLinks.devpost;
    if (research.discoveredLinks.personalWebsite && !builder.links?.personalWebsite) {
      linkUpdates.personalWebsite = research.discoveredLinks.personalWebsite;
    }
    if (research.discoveredLinks.twitter && !builder.links?.twitter) linkUpdates.twitter = research.discoveredLinks.twitter;
    if (research.discoveredLinks.github && !builder.links?.github) linkUpdates.github = research.discoveredLinks.github;
    const discoveredSources: EnrichmentSource[] = [];
    for (const [field, value] of Object.entries(linkUpdates)) {
      try {
        await updateLinks(builder, { [field]: value } as any);
        const source = sourceForLinkField(field);
        if (source && !sources.includes(source) && !discoveredSources.includes(source)) {
          discoveredSources.push(source);
        }
      } catch (err) {
        genericNotes.push(
          `Research found a possible ${field} link but it was not saved (${err instanceof Error ? err.message : 'invalid URL'})`
        );
      }
    }

    if (discoveredSources.length) {
      const res = await enrichBuilderProfile({
        builderId: params.builderId,
        sources: discoveredSources,
        runtime: params.runtime,
        deferExperiences: params.deferExperiences,
        onSourceStart: (source) => reportSourceProgress(params.builderId, source, discoveredSources),
      });
      results.push(...res.sources);
    }

    if (researchSummary) {
      await rememberBuilderFact(params.memRef, {
        content: `Web research summary: ${researchSummary.slice(0, 500)}`,
        kind: 'context',
        field: 'proof',
      });
    }

    if (researchResult?.searchProviders?.length || researchSummary) {
      const latest = await reloadBuilder(params.builderId);
      if (latest) {
        latest.enrichmentInsights = latest.enrichmentInsights || {};
        const existing = Array.isArray(latest.enrichmentInsights.sourcesCompleted)
          ? latest.enrichmentInsights.sourcesCompleted
          : [];
        const withoutResearch = existing.filter((row: any) => row?.source !== 'research');
        latest.enrichmentInsights.sourcesCompleted = [
          ...withoutResearch,
          {
            source: 'research',
            completedAt: new Date(),
            projectCount: 0,
            profileFields: researchResult?.searchProviders?.length
              ? [`brave+exa:${researchResult.searchProviders.join('+')}`]
              : ['web'],
          },
        ];
        latest.enrichmentInsights.updatedAt = new Date();
        await latest.save();
      }
    }
    }

    await persistEnrichmentContext({
    memRef: params.memRef,
    builderId: params.builderId,
    sourceResults: results,
    builder: await reloadBuilder(params.builderId),
    research: researchResult,
  });

  await aggregateInferredSkills(params.builderId);
  const refreshed = await reloadBuilder(params.builderId);
  if (refreshed) {
    await markSourcesCompleted(refreshed, results);
    await updateBuilderScores(refreshed);
  }

  const projects = await getProjects(params.builderId);
  const readiness = assessPublicProfileReadiness(refreshed || builder, projects);

  if (params.claim && results.length) {
    const { appendSessionMemory } = await import('@/lib/talent/builderSessionMemory');
    appendSessionMemory(
      params.claim,
      `Enrichment pipeline — ${sources.join(', ') || 'links'}: ${formatEnrichmentNote(results, researchSummary, genericNotes).slice(0, 400)}`
    );
  }

  const failedSources = results.filter(
    (r) => r.errors?.length && !r.profile && !r.projects?.length
  );
  if (failedSources.length) {
    notifyOps({
      event: 'enrichment_failed',
      title: `Builder Enrichment failed for ${builderLabel}`,
      severity: 'error',
      body: failedSources.map((r) => `${r.source}: ${(r.errors || []).join(', ')}`).join('\n'),
    });
  } else {
    notifyOps({
      event: 'enrichment_run',
      title: `New Builder Enrichment ${builderLabel}`,
    });
  }

  return {
    note: formatEnrichmentNote(results, researchSummary, genericNotes),
    results,
    readiness,
  };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'enrichment_failed';
    const isTimeout = /timed?\s*out/i.test(message);
    notifyOps({
      event: isTimeout ? 'enrichment_timeout' : 'enrichment_failed',
      title: isTimeout
        ? `Builder Enrichment timed out for ${builderLabel}`
        : `Builder Enrichment failed for ${builderLabel}`,
      severity: 'error',
      body: message.slice(0, 500),
    });
    throw err;
  } finally {
    slowWatch.cancel();
    await clearEnrichmentProgress(params.builderId);
  }
}

/**
 * Blocking polish pass before sharing the public profile link.
 * Runs any pending enrichments + research, then re-checks readiness.
 */
export async function ensureProfilePolishedBeforeShare(params: {
  builderId: string;
  memRef: MemoryRef;
  runtime?: RuntimeEnv;
  claim?: any;
  deferExperiences?: boolean;
  timeoutMs?: number;
}): Promise<PublicProfileReadiness & { polishNote: string; ran: boolean }> {
  const builder = await reloadBuilder(params.builderId);
  if (!builder) {
    return {
      ready: false,
      score: 0,
      blockers: ['builder not found'],
      recommendedSources: [],
      highlightsCount: 0,
      completedSources: [],
      polishNote: '',
      ran: false,
    };
  }

  const projects = await getProjects(params.builderId);
  let readiness = assessPublicProfileReadiness(builder, projects);
  if (readiness.ready) {
    return { ...readiness, polishNote: 'Profile already founder-ready.', ran: false };
  }

  const plan = planEnrichment(builder);
  const needsWork = plan.sources.length > 0 || plan.research || readiness.blockers.some((b) => b.startsWith('enrichment'));

  if (!needsWork) {
    return { ...readiness, polishNote: 'No pending enrichment sources; address blockers in conversation.', ran: false };
  }

  const timeoutMs = params.timeoutMs ?? 180_000;
  const pipeline = await Promise.race([
    runEnrichmentPipeline({
      builderId: params.builderId,
      memRef: params.memRef,
      sources: plan.sources,
      research: plan.research || readiness.highlightsCount < 2,
      runtime: params.runtime,
      claim: params.claim,
      deferExperiences: params.deferExperiences,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Profile polish timed out')), timeoutMs)
    ),
  ]);

  const refreshed = await reloadBuilder(params.builderId);
  const refreshedProjects = await getProjects(params.builderId);
  readiness = assessPublicProfileReadiness(refreshed || builder, refreshedProjects);

  return {
    ...readiness,
    polishNote: pipeline.note,
    ran: true,
  };
}

/** Agent-facing enrichment + public-profile readiness block (for system prompt). */
export function enrichmentStatusForAgent(builder: any, projects: any[]) {
  const readiness = assessPublicProfileReadiness(builder, projects);
  const plan = planEnrichment(builder);
  return {
    enrichment: {
      completedSources: readiness.completedSources,
      pendingSources: plan.sources,
      founderHighlights: (builder?.enrichmentInsights?.founderHighlights || []).slice(0, 6),
      githubShowcase: builder?.enrichmentInsights?.githubShowcase || null,
    },
    publicProfileReadiness: {
      ready: readiness.ready,
      score: readiness.score,
      blockers: readiness.blockers.slice(0, 8),
    },
  };
}

export function buildEnrichmentPlaybookHint(builder: any): string {
  const plan = planEnrichment(builder);
  const completed = getCompletedSources(builder);
  const lines = [
    'ENRICHMENT PLAYBOOK (use run_enrichment / deep_research — findings land next turn unless you call polish_profile):',
    '1. When GitHub OR LinkedIn link lands → run_enrichment with [github, linkedin] immediately.',
    '2. When Devpost profile link lands → run_enrichment with [devpost] (scrapes ALL hackathon projects on their profile).',
    '3. When Twitter/X link lands → run_enrichment with [twitter] (voice + posts, NOT projects).',
    '4. When portfolio/personal site lands → run_enrichment with [portfolio] (+ deep_research if the profile still needs more proof).',
    '5. After core links, deep research runs automatically (Brave + Exa web search + markdown crawl).',
    '6. BEFORE send_profile_link or finalize_profile → call polish_profile (runs anything still pending).',
    '7. After enrichment lands: confirm LinkedIn work history with ONE yes/no, draft headline/bio from findings, write ALL project contributions in one update_builder_data call.',
    `Completed enrichment: ${completed.length ? completed.join(', ') : 'none yet'}.`,
    plan.sources.length
      ? `Pending (auto-schedule or call run_enrichment): ${plan.sources.join(', ')}.`
      : 'All link-based enrichments have run — focus on confirmations + contributions.',
  ];
  return lines.join('\n');
}
