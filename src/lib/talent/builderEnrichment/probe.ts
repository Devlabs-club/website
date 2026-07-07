import type { RuntimeEnv } from '@/lib/workosEnv';
import { classifyLink, probeGenericLink } from '@/lib/talent/builderLinkProcessor';
import {
  auditGithubReposForUser,
  enrichGithubReposForUser,
  GITHUB_ENRICHMENT_TUNING,
} from '@/lib/talent/builderEnrichment/githubEnricher';
import { enrichDevpostUrl } from '@/lib/talent/builderEnrichment/devpostEnricher';
import { probeLinkedInProfile } from '@/lib/talent/builderEnrichment/linkedinEnricher';
import { enrichFromPortfolio } from '@/lib/talent/builderEnrichment/portfolioEnricher';
import { enrichFromTwitter } from '@/lib/talent/builderEnrichment/twitterEnricher';
import {
  extractResumeData,
  mapResumeExtractionToDraft,
} from '@/lib/talent/builderEnrichment/resumeEnricher';
import { downloadResumeAsPdf } from '@/lib/talent/builderEnrichment/resumeUrl';
import type { EnrichedProjectDraft, EnrichmentSource, SourceEnrichmentResult } from '@/lib/talent/builderEnrichment/types';

export type EnrichmentProbeSource = EnrichmentSource | 'generic_link';

export type EnrichmentProbeRequest = {
  source: EnrichmentProbeSource;
  /** Display name used in LLM prompts */
  name?: string;
  /** Primary URL — devpost, linkedin, portfolio, resume PDF, twitter, generic */
  url?: string;
  /** GitHub username or full profile URL */
  githubUsername?: string;
  /** When true (github only), include per-repo filter audit without LLM summaries */
  audit?: boolean;
  runtime?: RuntimeEnv;
};

export type EnrichmentQualityReport = {
  projectCount: number;
  projectsWithDescription: number;
  projectsWithContribution: number;
  projectsWithTechStack: number;
  avgDescriptionLength: number;
  skillCount: number;
  experienceCount: number;
  profileFieldsPresent: string[];
};

export type EnrichmentProbeResult = {
  source: EnrichmentProbeSource;
  durationMs: number;
  dryRun: true;
  input: EnrichmentProbeRequest;
  profile?: SourceEnrichmentResult['profile'];
  projects?: EnrichedProjectDraft[];
  errors?: string[];
  meta?: Record<string, unknown>;
  quality: EnrichmentQualityReport;
  /** Raw enricher payload for debugging */
  raw?: SourceEnrichmentResult | Record<string, unknown>;
};

export const SAMPLE_PROBE_PROFILES = {
  github_dhanush: {
    source: 'github' as const,
    githubUsername: 'dhanush17-tech',
    name: 'Dhanush Vardhan',
  },
  linkedin_dhanush: {
    source: 'linkedin' as const,
    url: 'https://www.linkedin.com/in/dhanush-vardhan-30bb881b0/',
    name: 'Dhanush Vardhan',
  },
} satisfies Record<string, EnrichmentProbeRequest>;

function mockBuilder(input: EnrichmentProbeRequest) {
  const url = input.url?.trim() || '';
  const kind = url ? classifyLink(url) : null;
  const github =
    input.githubUsername?.trim()
      ? `https://github.com/${input.githubUsername.replace(/^@/, '')}`
      : kind === 'github'
        ? url
        : null;

  return {
    _id: 'probe',
    name: input.name || 'Probe Builder',
    email: 'probe@devlabs.club',
    links: {
      github,
      linkedin: kind === 'linkedin' ? url : null,
      devpost: kind === 'devpost' ? url : null,
      portfolio: kind === 'generic' && /portfolio|\.dev|\.me|\.io/i.test(url) ? url : null,
      personalWebsite: kind === 'generic' ? url : null,
      resume: /\.pdf($|\?)/i.test(url) ? url : null,
      twitter: kind === 'twitter' ? url : null,
    },
  };
}

function buildQualityReport(
  profile?: SourceEnrichmentResult['profile'],
  projects?: EnrichedProjectDraft[]
): EnrichmentQualityReport {
  const list = projects || [];
  const descriptions = list.map((p) => String(p.description || '').trim()).filter(Boolean);
  const profileFieldsPresent: string[] = [];
  if (profile?.headline) profileFieldsPresent.push('headline');
  if (profile?.bio) profileFieldsPresent.push('bio');
  if (profile?.location) profileFieldsPresent.push('location');
  if ((profile?.skills || []).length) profileFieldsPresent.push('skills');
  if ((profile?.rolePreference || []).length) profileFieldsPresent.push('rolePreference');
  if ((profile?.experiences || []).length) profileFieldsPresent.push('experiences');
  if ((profile?.education || []).length) profileFieldsPresent.push('education');
  if (profile?.links && Object.values(profile.links).some(Boolean)) profileFieldsPresent.push('links');

  return {
    projectCount: list.length,
    projectsWithDescription: descriptions.length,
    projectsWithContribution: list.filter((p) => String(p.builderContribution || '').trim()).length,
    projectsWithTechStack: list.filter((p) => (p.techStack || []).length > 0).length,
    avgDescriptionLength: descriptions.length
      ? Math.round(descriptions.reduce((sum, d) => sum + d.length, 0) / descriptions.length)
      : 0,
    skillCount: (profile?.skills || []).length,
    experienceCount: (profile?.experiences || []).length,
    profileFieldsPresent,
  };
}

function parseGithubUsername(input?: string | null): string | null {
  if (!input?.trim()) return null;
  const raw = input.trim();
  if (!raw.includes('/') && !raw.includes('.')) return raw.replace(/^@/, '');
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

/** Run a single enrichment source in dry-run mode — no builder DB writes. */
export async function runEnrichmentProbe(input: EnrichmentProbeRequest): Promise<EnrichmentProbeResult> {
  const started = Date.now();
  const base = {
    source: input.source,
    dryRun: true as const,
    input,
    quality: buildQualityReport(),
    durationMs: 0,
  };

  try {
    if (input.source === 'github') {
      const username = parseGithubUsername(input.githubUsername || input.url);
      if (!username) {
        return {
          ...base,
          durationMs: Date.now() - started,
          errors: ['github_username_required'],
          meta: { tuning: GITHUB_ENRICHMENT_TUNING },
        };
      }

      if (input.audit) {
        const audit = await auditGithubReposForUser(username);
        const enriched = await enrichGithubReposForUser(username, input.name);
        return {
          ...base,
          durationMs: Date.now() - started,
          profile: enriched.profile,
          projects: enriched.projects,
          meta: { ...enriched.meta, audit },
          quality: buildQualityReport(enriched.profile, enriched.projects),
          raw: { audit, enrichment: enriched },
        };
      }

      const enriched = await enrichGithubReposForUser(username, input.name);
      return {
        ...base,
        durationMs: Date.now() - started,
        profile: enriched.profile,
        projects: enriched.projects,
        meta: enriched.meta,
        quality: buildQualityReport(enriched.profile, enriched.projects),
        raw: enriched,
      };
    }

    if (input.source === 'devpost') {
      if (!input.url) {
        return { ...base, durationMs: Date.now() - started, errors: ['url_required'] };
      }
      const project = await enrichDevpostUrl(input.url, input.name);
      const projects = project ? [project] : [];
      return {
        ...base,
        durationMs: Date.now() - started,
        projects,
        errors: project ? undefined : ['devpost_empty'],
        quality: buildQualityReport(undefined, projects),
        raw: { project },
      };
    }

    if (input.source === 'linkedin') {
      if (!input.url) {
        return { ...base, durationMs: Date.now() - started, errors: ['url_required'] };
      }
      const result = await probeLinkedInProfile(input.url, input.runtime);
      return {
        ...base,
        durationMs: Date.now() - started,
        profile: result.profile,
        projects: result.projects,
        errors: result.errors,
        meta: result.meta,
        quality: buildQualityReport(result.profile, result.projects),
        raw: result,
      };
    }

    if (input.source === 'resume') {
      if (!input.url) {
        return { ...base, durationMs: Date.now() - started, errors: ['resume_url_required'] };
      }
      const downloaded = await downloadResumeAsPdf(input.url, { signal: AbortSignal.timeout(30000) });
      const parsed = await extractResumeData(downloaded.buffer, { localPdfPath: downloaded.localPdfPath });
      if (!parsed.extracted) {
        return {
          ...base,
          durationMs: Date.now() - started,
          errors: [parsed.reason || 'resume_parse_failed'],
          meta: {
            fetchUrl: downloaded.fetchUrl,
            textLength: parsed.text?.length || 0,
          },
        };
      }
      const { profile, projects } = mapResumeExtractionToDraft(parsed.extracted);
      return {
        ...base,
        durationMs: Date.now() - started,
        profile,
        projects,
        meta: {
          fetchUrl: downloaded.fetchUrl,
          textLength: parsed.text.length,
        },
        quality: buildQualityReport(profile, projects),
        raw: { extracted: parsed.extracted },
      };
    }

    if (input.source === 'portfolio') {
      const builder = mockBuilder(input);
      const result = await enrichFromPortfolio(builder);
      return {
        ...base,
        durationMs: Date.now() - started,
        profile: result.profile,
        projects: result.projects,
        errors: result.errors,
        meta: { ...result.meta, dryRun: true },
        quality: buildQualityReport(result.profile, result.projects),
        raw: result,
      };
    }

    if (input.source === 'twitter') {
      const builder = mockBuilder(input);
      const result = await enrichFromTwitter(builder, { runtime: input.runtime });
      return {
        ...base,
        durationMs: Date.now() - started,
        profile: result.profile,
        projects: result.projects,
        errors: result.errors,
        meta: { ...result.meta, dryRun: true },
        quality: buildQualityReport(result.profile, result.projects),
        raw: result,
      };
    }

    if (input.source === 'generic_link') {
      if (!input.url) {
        return { ...base, durationMs: Date.now() - started, errors: ['url_required'] };
      }
      const result = await probeGenericLink(input.url);
      const profile = {
        headline: null,
        bio: null,
        skills: result.skills || [],
        links: {
          portfolio: classifyLink(input.url) === 'generic' ? input.url : null,
          ...(result.discoveredLinks || {}),
        },
      };
      return {
        ...base,
        durationMs: Date.now() - started,
        profile,
        errors: result.ok ? undefined : ['generic_link_empty'],
        meta: {
          summary: result.summary,
          coolFacts: result.coolFacts,
          discoveredLinks: result.discoveredLinks,
        },
        quality: buildQualityReport(profile, []),
        raw: result,
      };
    }

    return { ...base, durationMs: Date.now() - started, errors: ['unknown_source'] };
  } catch (err) {
    return {
      ...base,
      durationMs: Date.now() - started,
      errors: [err instanceof Error ? err.message : 'probe_failed'],
    };
  }
}

export async function runEnrichmentProbeBatch(
  probes: EnrichmentProbeRequest[]
): Promise<{ results: EnrichmentProbeResult[]; totalDurationMs: number }> {
  const started = Date.now();
  const results: EnrichmentProbeResult[] = [];
  for (const probe of probes) {
    results.push(await runEnrichmentProbe(probe));
  }
  return { results, totalDurationMs: Date.now() - started };
}
