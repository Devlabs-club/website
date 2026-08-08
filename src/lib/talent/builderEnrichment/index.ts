import type { RuntimeEnv } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { aggregateInferredSkills, applyProfileDraft, refreshBuilderScores, upsertEnrichedProjects } from './apply';
import { upsertTalentSearchIndexForBuilder } from '@/lib/talent/searchIndex';
import { enrichFromDevpost } from './devpostEnricher';
import { enrichFromGithub } from './githubEnricher';
import { enrichFromLinkedIn } from './linkedinEnricher';
import { enrichFromPortfolio } from './portfolioEnricher';
import { enrichFromResume } from './resumeEnricher';
import { enrichFromTwitter } from './twitterEnricher';
import type { BuilderEnrichmentResult, EnrichmentSource } from './types';

const DEFAULT_ORDER: EnrichmentSource[] = [
  'resume',
  'github',
  'devpost',
  'linkedin',
  'portfolio',
  'twitter',
];

/** Soft per-source budget so one hung crawl/LLM cannot leave the whole run stuck. */
const SOURCE_TIMEOUT_MS: Partial<Record<EnrichmentSource, number>> = {
  linkedin: 120_000,
  github: 120_000,
  portfolio: 90_000,
  resume: 60_000,
  devpost: 60_000,
  twitter: 45_000,
};

async function withSourceTimeout<T>(
  source: EnrichmentSource,
  promise: Promise<T>
): Promise<T | { source: EnrichmentSource; errors: string[] }> {
  const timeoutMs = SOURCE_TIMEOUT_MS[source] ?? 90_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${source}_timed_out_after_${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : `${source}_failed`;
    return { source, errors: [message] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const ENRICHERS: Record<
  EnrichmentSource,
  (
    builder: any,
    ctx?: {
      runtime?: RuntimeEnv;
      deferExperiences?: boolean;
      onProgress?: (brief: string) => void | Promise<void>;
    }
  ) => Promise<import('./types').SourceEnrichmentResult>
> = {
  resume: (builder, ctx) => enrichFromResume(builder, ctx),
  github: (builder, ctx) => enrichFromGithub(builder, ctx),
  devpost: (builder, ctx) => enrichFromDevpost(builder, ctx),
  linkedin: (builder, ctx) => enrichFromLinkedIn(builder, ctx),
  portfolio: (builder, ctx) => enrichFromPortfolio(builder, ctx),
  twitter: (builder, ctx) => enrichFromTwitter(builder, ctx),
};

export async function enrichBuilderProfile(params: {
  builderId: string;
  sources?: EnrichmentSource[];
  dryRun?: boolean;
  overwriteImportedProjects?: boolean;
  /** When true, LinkedIn work history is held back until the agent confirms with the builder. */
  deferExperiences?: boolean;
  runtime?: RuntimeEnv;
  onSourceStart?: (source: EnrichmentSource) => void | Promise<void>;
  /** Fine-grained live brief for the builder overlay (URLs, repos, pages). */
  onProgress?: (brief: string) => void | Promise<void>;
}): Promise<BuilderEnrichmentResult> {
  const builder = await BuilderProfile.findById(params.builderId);
  if (!builder) {
    throw new Error(`Builder not found: ${params.builderId}`);
  }

  const sources = params.sources?.length ? params.sources : DEFAULT_ORDER;
  const sourceResults: BuilderEnrichmentResult['sources'] = [];
  const profileFieldsUpdated: string[] = [];
  let projectsCreated = 0;
  let projectsUpdated = 0;
  const report = async (brief: string) => {
    try {
      await params.onProgress?.(brief);
    } catch {
      /* progress is best-effort */
    }
  };

  for (const source of sources) {
    await params.onSourceStart?.(source);
    const enricher = ENRICHERS[source];
    const target =
      source === 'portfolio'
        ? builder.links?.portfolio || builder.links?.personalWebsite
        : source === 'resume'
          ? builder.links?.resume
          : (builder.links as any)?.[source];
    if (target) await report(`Fetching ${target}`);

    const result = (await withSourceTimeout(
      source,
      enricher(builder, {
        runtime: params.runtime,
        deferExperiences: params.deferExperiences,
        onProgress: report,
      })
    )) as BuilderEnrichmentResult['sources'][number];
    sourceResults.push(result);

    if (result.errors?.length && !result.profile && !result.projects?.length) {
      console.warn('[enrichBuilderProfile] source failed/timed out', {
        builderId: params.builderId,
        source,
        errors: result.errors,
      });
      await report(`${source} skipped: ${result.errors[0]}`);
      continue;
    }

    if (result.projects?.length) {
      await report(
        `${source}: saved ${result.projects.length} project${result.projects.length === 1 ? '' : 's'}`
      );
    } else if (result.profile) {
      await report(`${source}: profile fields updated`);
    }

    if (params.dryRun) continue;

    if (result.meta?.appliedInEnricher && result.meta.writeResult) {
      const writeResult = result.meta.writeResult as {
        profileFieldsUpdated?: string[];
        projectsCreated?: number;
        projectsUpdated?: number;
      };
      profileFieldsUpdated.push(...(writeResult.profileFieldsUpdated || []));
      projectsCreated += writeResult.projectsCreated || 0;
      projectsUpdated += writeResult.projectsUpdated || 0;
      const refreshed = await BuilderProfile.findById(builder._id);
      if (refreshed) Object.assign(builder, refreshed.toObject());
      continue;
    }

    if (result.profile) {
      const updated = await applyProfileDraft(builder, result.profile, {
        overwriteBasics: false,
        writeBasics: source === 'resume',
        deferExperiences: params.deferExperiences,
      });
      profileFieldsUpdated.push(...updated);
    }

    if (result.projects?.length) {
      const counts = await upsertEnrichedProjects(builder._id, result.projects, {
        overwriteImported: params.overwriteImportedProjects ?? true,
      });
      projectsCreated += counts.created;
      projectsUpdated += counts.updated;
    }

    await builder.save();
    // Keep the talent search index fresh as enrichment sources land so founder
    // searches don't miss builders whose profile is still being built.
    await upsertTalentSearchIndexForBuilder(builder._id);
  }

  if (!params.dryRun) {
    await aggregateInferredSkills(builder._id);
    await refreshBuilderScores(builder._id);
  }

  return {
    builderId: String(builder._id),
    sources: sourceResults,
    projectsCreated,
    projectsUpdated,
    profileFieldsUpdated: [...new Set(profileFieldsUpdated)],
  };
}

export { enrichFromResume, enrichFromGithub, enrichFromDevpost, enrichFromLinkedIn, enrichFromPortfolio, enrichFromTwitter };
export {
  runEnrichmentProbe,
  runEnrichmentProbeBatch,
  SAMPLE_PROBE_PROFILES,
  type EnrichmentProbeRequest,
  type EnrichmentProbeResult,
} from './probe';
export { auditGithubReposForUser, enrichGithubReposForUser, GITHUB_ENRICHMENT_TUNING } from './githubEnricher';
export { probeLinkedInProfile } from './linkedinEnricher';
export { enrichDevpostUrl, enrichDevpostProfile, isDevpostProfileUrl } from './devpostEnricher';
export { persistEnrichmentContext } from './enrichmentInsights';
export {
  planEnrichment,
  assessPublicProfileReadiness,
  runEnrichmentPipeline,
  ensureProfilePolishedBeforeShare,
  buildEnrichmentPlaybookHint,
  enrichmentStatusForAgent,
} from './orchestrator';
export type { EnrichmentSource, BuilderEnrichmentResult } from './types';
