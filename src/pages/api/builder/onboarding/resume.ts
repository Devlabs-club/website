import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import {
  requireRemoteLinkedInScraperConfig,
  runRequiredRemoteLinkedInScraperScript,
} from '@/lib/remoteLinkedInScraper';
import { uploadResumeToCloudinary } from '@/lib/cloudinary';
import BuilderProfile from '@/models/talent/BuilderProfile';
import {
  extractResumeData,
  mapResumeExtractionToDraft,
} from '@/lib/talent/builderEnrichment/resumeEnricher';
import { enrichFromGithub } from '@/lib/talent/builderEnrichment/githubEnricher';
import { enrichFromLinkedIn } from '@/lib/talent/builderEnrichment/linkedinEnricher';
import {
  applyProfileDraft,
  refreshBuilderScores,
  upsertEnrichedProjects,
} from '@/lib/talent/builderEnrichment/apply';
import type { EnrichedProjectDraft, SourceEnrichmentResult } from '@/lib/talent/builderEnrichment/types';

export const prerender = false;

type Runtime = Record<string, string | undefined>;
type LinkSet = { github?: string | null; linkedin?: string | null; portfolio?: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanUrl(value: string) {
  return value.trim().replace(/[),.;\]\s]+$/g, '');
}

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizeGithubInput(input: unknown): string | null {
  const raw = cleanString(input);
  if (!raw) return null;
  const withoutAt = raw.replace(/^@+/, '');

  if (/^[A-Za-z0-9-]+$/.test(withoutAt) && !withoutAt.includes('.')) {
    return `https://github.com/${withoutAt}`;
  }

  try {
    const url = new URL(withProtocol(withoutAt));
    if (!url.hostname.toLowerCase().includes('github.com')) return null;
    const username = url.pathname.split('/').filter(Boolean)[0];
    if (!username || ['orgs', 'users', 'topics', 'marketplace'].includes(username.toLowerCase())) return null;
    return `https://github.com/${username}`;
  } catch {
    return null;
  }
}

function normalizeLinkedInInput(input: unknown): string | null {
  const raw = cleanString(input);
  if (!raw) return null;
  const withoutAt = raw.replace(/^@+/, '');

  if (/^[A-Za-z0-9-_%]+$/.test(withoutAt) && !withoutAt.includes('.')) {
    return `https://www.linkedin.com/in/${encodeURIComponent(decodeURIComponent(withoutAt))}/`;
  }

  try {
    const url = new URL(withProtocol(withoutAt));
    if (!url.hostname.toLowerCase().includes('linkedin.com')) return null;
    const match = url.pathname.match(/\/in\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    return `https://www.linkedin.com/in/${encodeURIComponent(decodeURIComponent(match[1]))}/`;
  } catch {
    return null;
  }
}

function normalizePortfolioInput(input: unknown): string | null {
  const raw = cleanString(input);
  if (!raw) return null;
  try {
    const url = new URL(withProtocol(raw));
    if (url.hostname.includes('github.com') || url.hostname.includes('linkedin.com')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractLinksFromText(text: string): LinkSet {
  const links: LinkSet = {};
  const matches = text.match(/(?:https?:\/\/|www\.)[^\s<>()\]]+|(?:github\.com|linkedin\.com\/in)\/[^\s<>()\]]+/gi) || [];

  for (const match of matches.map(cleanUrl)) {
    links.github ||= normalizeGithubInput(match);
    links.linkedin ||= normalizeLinkedInInput(match);
    links.portfolio ||= normalizePortfolioInput(match);
  }

  return links;
}

function mergeExtractedLinks(...sets: Array<LinkSet | undefined | null>): LinkSet {
  const merged: LinkSet = {};
  for (const set of sets) {
    if (!set) continue;
    merged.github ||= normalizeGithubInput(set.github);
    merged.linkedin ||= normalizeLinkedInInput(set.linkedin);
    merged.portfolio ||= normalizePortfolioInput(set.portfolio);
  }
  return merged;
}

async function resolveUser(request: Request, locals: App.Locals) {
  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return { user: null, runtime };
  const decoded = verifyToken(token, runtime);
  if (!decoded) return { user: null, runtime };
  return { user: await findUserById(decoded.userId, runtime), runtime };
}

async function ensureBuilderProfile(user: NonNullable<Awaited<ReturnType<typeof findUserById>>>) {
  let builder = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  });

  if (!builder) {
    builder = await BuilderProfile.create({
      userId: user._id,
      name: user.name || user.email.split('@')[0],
      email: user.email,
      links: {},
      verificationStatus: 'imported_unverified',
      visibilityStatus: 'matched_only',
    });
  } else {
    builder.userId = user._id;
    builder.email = builder.email || user.email;
    builder.name = builder.name || user.name || user.email.split('@')[0];
  }

  return builder;
}

function assignLinks(builder: any, links: LinkSet & { resume?: string | null }) {
  builder.links = builder.links || {};
  if (links.resume) builder.links.resume = links.resume;
  if (links.github) builder.links.github = links.github;
  if (links.linkedin) builder.links.linkedin = links.linkedin;
  if (links.portfolio) builder.links.portfolio = links.portfolio;
}

function missingLinks(builder: any): Array<'github' | 'linkedin'> {
  const missing: Array<'github' | 'linkedin'> = [];
  if (!builder?.links?.github) missing.push('github');
  if (!builder?.links?.linkedin) missing.push('linkedin');
  return missing;
}

async function runBuilderLinkedInCdp(builder: any, cdpUrl: string, runtime?: Runtime) {
  const args = [
    '--builderId',
    String(builder._id),
    '--cdp-url',
    cdpUrl,
    '--wait-ms',
    '12000',
  ];
  return runRequiredRemoteLinkedInScraperScript('enrich-builder-linkedin-cdp.mjs', args, runtime);
}

function applyableLinkedInUpdate(artifact: any, linkedInUrl: string) {
  const proposed = artifact?.proposedMongoUpdate || {};
  const update: Record<string, any> = {
    $set: {
      ...(proposed.$set || {}),
      'links.linkedin': linkedInUrl,
      updatedAt: new Date(),
    },
  };
  if (proposed.$addToSet && Object.keys(proposed.$addToSet).length) update.$addToSet = proposed.$addToSet;
  if (proposed.$push && Object.keys(proposed.$push).length) update.$push = proposed.$push;
  return update;
}

async function enrichFromLinkedInCdp(
  builder: any,
  runtime?: Runtime
): Promise<SourceEnrichmentResult> {
  const linkedInUrl = cleanString(builder.links?.linkedin);
  if (!linkedInUrl) return { source: 'linkedin', errors: ['no_linkedin_url'] };

  const cdpUrl = 'http://127.0.0.1:9222';
  const remoteScraper = requireRemoteLinkedInScraperConfig(runtime);
  const cdp = { started: false, remote: true, url: remoteScraper.url };
  const { summary, artifact } = await runBuilderLinkedInCdp(builder, cdpUrl, runtime);
  const proposed = artifact?.proposedMongoUpdate;
  const extracted = artifact?.extracted || {};
  const extractedExperienceCount = Array.isArray(extracted.experiences) ? extracted.experiences.length : 0;
  const extractedEducationCount = Array.isArray(extracted.education) ? extracted.education.length : 0;
  const photoUrl = cleanString(extracted.cdpExtraction?.photo?.imageUrl);

  if (proposed) {
    await BuilderProfile.updateOne({ _id: builder._id }, applyableLinkedInUpdate(artifact, linkedInUrl));
  }

  return {
    source: 'linkedin',
    meta: {
      transport: 'chrome_cdp',
      cdp,
      summary,
      artifactPath: summary?.outputPath || null,
      profilePhotoUrl: photoUrl,
      extractedExperienceCount,
      extractedEducationCount,
      warnings: extracted.warnings || [],
    },
  };
}

async function applyEnrichmentResult(
  builder: any,
  result: SourceEnrichmentResult,
  options?: { applyProjects?: boolean }
) {
  if (result.profile) {
    await applyProfileDraft(builder, result.profile, {
      overwriteBasics: result.source === 'linkedin',
    });
    await builder.save();
  }

  if (options?.applyProjects !== false && result.projects?.length) {
    await upsertEnrichedProjects(builder._id, result.projects, {
      overwriteImported: true,
    });
  }
}

async function enrichAvailableSources(
  builder: any,
  runtime?: Runtime
): Promise<{ sources: SourceEnrichmentResult[]; githubProjectOptions: EnrichedProjectDraft[] }> {
  const results: SourceEnrichmentResult[] = [];
  let githubProjectOptions: EnrichedProjectDraft[] = [];

  if (builder.links?.github) {
    const result = await enrichFromGithub(builder);
    results.push(result);
    await applyEnrichmentResult(builder, result, { applyProjects: false });
    githubProjectOptions = result.projects || [];
  }

  if (builder.links?.linkedin) {
    let result: SourceEnrichmentResult;
    try {
      result = await enrichFromLinkedInCdp(builder, runtime);
    } catch (error) {
      result = {
        source: 'linkedin',
        errors: [error instanceof Error ? error.message : 'linkedin_cdp_failed'],
        meta: { transport: 'chrome_cdp' },
      };
    }

    const cdpExperienceCount =
      typeof result.meta?.extractedExperienceCount === 'number' ? result.meta.extractedExperienceCount : 0;
    const cdpPhotoUrl = cleanString(result.meta?.profilePhotoUrl);
    if (result.errors?.length || cdpExperienceCount === 0) {
      const fallback = await enrichFromLinkedIn(builder);
      result = {
        ...fallback,
        errors: [...(result.errors || []), ...(fallback.errors || [])],
        meta: {
          ...(fallback.meta || {}),
          profilePhotoUrl: cleanString(fallback.meta?.profilePhotoUrl) || cdpPhotoUrl,
          cdp: result.meta || null,
          fallbackTransport: 'generic_linkedin_enricher',
        },
      };
      await applyEnrichmentResult(builder, fallback);
    }

    results.push(result);

    const photoUrl = cleanString(result.meta?.profilePhotoUrl);
    if (photoUrl && builder.userId) {
      await updateUserAccount(String(builder.userId), { avatarUrl: photoUrl }, runtime);
    }
  }

  if (results.length) {
    await refreshBuilderScores(builder._id, {
      skipQuality: true,
      skipEmbeddings: true,
    });
  }

  return { sources: results, githubProjectOptions };
}

function sanitizeSelectedGithubProjects(input: unknown): EnrichedProjectDraft[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      const project = raw as Record<string, unknown>;
      const projectName = cleanString(project.projectName);
      const sourceId = cleanString(project.sourceId);
      const source = cleanString(project.source) || 'github_profile_enrichment';
      if (!projectName || !sourceId || !sourceId.includes('github.com')) return null;

      const links = project.links && typeof project.links === 'object' ? project.links as Record<string, unknown> : {};
      return {
        projectName,
        description: cleanString(project.description),
        problemSolved: cleanString(project.problemSolved),
        techStack: Array.isArray(project.techStack)
          ? project.techStack.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
          : [],
        builderContribution: cleanString(project.builderContribution),
        links: {
          github: cleanString(links.github),
          demo: cleanString(links.demo),
        },
        source,
        sourceId,
        verificationStatus: 'imported_unverified',
        confidence: typeof project.confidence === 'number' ? Math.min(0.95, Math.max(0, project.confidence)) : 0.8,
      } satisfies EnrichedProjectDraft;
    })
    .filter(Boolean)
    .slice(0, 12) as EnrichedProjectDraft[];
}

function serializeLinks(builder: any) {
  return {
    github: builder.links?.github || null,
    linkedin: builder.links?.linkedin || null,
    portfolio: builder.links?.portfolio || null,
    resume: builder.links?.resume || null,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, runtime } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('resume');
  if (!(file instanceof File)) return json({ success: false, error: 'Upload a PDF resume to continue.' }, 400);
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return json({ success: false, error: 'Only PDF resumes are supported.' }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return json({ success: false, error: 'Resume must be under 10MB.' }, 400);
  }

  try {
    await connectAdminDB();
    const builder = await ensureBuilderProfile(user);
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFilename = `builder-resume-${user._id}-${Date.now()}`;
    const resumeUrl = await uploadResumeToCloudinary(buffer, safeFilename);

    const parsed = await extractResumeData(buffer);
    const textLinks = extractLinksFromText(parsed.text || '');
    let extractedLinks: LinkSet = {};

    if (parsed.extracted) {
      const { profile, projects } = mapResumeExtractionToDraft(parsed.extracted);
      extractedLinks = profile.links || {};
      await applyProfileDraft(builder, profile);
      if (projects.length) {
        await upsertEnrichedProjects(builder._id, projects, { overwriteImported: true });
      }
    }

    assignLinks(builder, {
      resume: resumeUrl,
      ...mergeExtractedLinks(textLinks, extractedLinks),
    });
    await builder.save();

    const enrichment = await enrichAvailableSources(builder, runtime);
    const missing = missingLinks(builder);

    await updateUserAccount(String(user._id), {
      role: 'builder',
      accountType: 'builder',
      onboardingStatus: missing.length ? 'links' : enrichment.githubProjectOptions.length ? 'github_projects' : 'profile',
    }, runtime);

    return json({
      success: true,
      next: '/builder/onboarding/profile',
      links: serializeLinks(builder),
      missingLinks: missing,
      githubProjectOptions: enrichment.githubProjectOptions,
      resumeParseReason: parsed.reason,
      enrichment: enrichment.sources,
    });
  } catch (error) {
    console.error('[builder-onboarding-resume] upload failed', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Could not upload and scan your resume.',
    }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const { user, runtime } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  const body = await request.json().catch(() => ({}));
  const githubProjectSelectionComplete = Boolean(body.githubProjectSelectionComplete);
  const links = mergeExtractedLinks({
    github: body.github,
    linkedin: body.linkedin,
    portfolio: body.portfolio,
  });

  try {
    await connectAdminDB();
    const builder = await ensureBuilderProfile(user);

    if (githubProjectSelectionComplete) {
      const selectedProjects = sanitizeSelectedGithubProjects(body.selectedGithubProjects);
      if (selectedProjects.length) {
        await upsertEnrichedProjects(builder._id, selectedProjects, { overwriteImported: true });
      }
      await refreshBuilderScores(builder._id, {
        skipQuality: true,
        skipEmbeddings: true,
      });
      await updateUserAccount(String(user._id), {
        role: 'builder',
        accountType: 'builder',
        onboardingStatus: 'profile',
      }, runtime);

      return json({
        success: true,
        next: '/builder/onboarding/profile',
        links: serializeLinks(builder),
        missingLinks: missingLinks(builder),
        githubProjectsImported: selectedProjects.length,
      });
    }

    assignLinks(builder, links);
    await builder.save();

    const enrichment = await enrichAvailableSources(builder, runtime);
    const missing = missingLinks(builder);

    await updateUserAccount(String(user._id), {
      role: 'builder',
      accountType: 'builder',
      onboardingStatus: missing.length ? 'links' : enrichment.githubProjectOptions.length ? 'github_projects' : 'profile',
    }, runtime);

    return json({
      success: true,
      next: '/builder/onboarding/profile',
      links: serializeLinks(builder),
      missingLinks: missing,
      githubProjectOptions: enrichment.githubProjectOptions,
      enrichment: enrichment.sources,
    });
  } catch (error) {
    console.error('[builder-onboarding-resume] link enrichment failed', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Could not enrich your links.',
    }, 500);
  }
};
