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

const ENRICHERS: Record<
  EnrichmentSource,
  (builder: any, ctx?: { runtime?: RuntimeEnv; deferExperiences?: boolean }) => Promise<import('./types').SourceEnrichmentResult>
> = {
  resume: (builder) => enrichFromResume(builder),
  github: (builder) => enrichFromGithub(builder),
  devpost: (builder) => enrichFromDevpost(builder),
  linkedin: (builder, ctx) => enrichFromLinkedIn(builder, ctx),
  portfolio: (builder) => enrichFromPortfolio(builder),
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

  for (const source of sources) {
    const enricher = ENRICHERS[source];
    const result = await enricher(builder, { runtime: params.runtime, deferExperiences: params.deferExperiences });
    sourceResults.push(result);

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
