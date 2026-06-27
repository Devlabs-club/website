import BuilderProfile from '@/models/talent/BuilderProfile';
import { applyProfileDraft, refreshBuilderScores, upsertEnrichedProjects } from './apply';
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
  (builder: any) => Promise<import('./types').SourceEnrichmentResult>
> = {
  resume: enrichFromResume,
  github: enrichFromGithub,
  devpost: enrichFromDevpost,
  linkedin: enrichFromLinkedIn,
  portfolio: enrichFromPortfolio,
  twitter: enrichFromTwitter,
};

export async function enrichBuilderProfile(params: {
  builderId: string;
  sources?: EnrichmentSource[];
  dryRun?: boolean;
  overwriteImportedProjects?: boolean;
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
    const result = await enricher(builder);
    sourceResults.push(result);

    if (params.dryRun) continue;

    if (result.profile) {
      const updated = await applyProfileDraft(builder, result.profile, {
        overwriteBasics: source === 'linkedin',
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
  }

  if (!params.dryRun) {
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
export type { EnrichmentSource, BuilderEnrichmentResult } from './types';
