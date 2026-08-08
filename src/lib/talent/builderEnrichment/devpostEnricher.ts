import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { extractLinksFromMarkdown } from './crawlMarkdown';
import { fetchUrlMarkdown, normalizeUrl } from './urlToMarkdown';
import type { EnrichedProjectDraft, SourceEnrichmentResult } from './types';

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const DEVPOST_EXTRACT_PROMPT = `Extract hackathon project details from Devpost page markdown.
Return strict JSON:
{
  "projectName": "string",
  "description": "string (max 400 chars, what the product does)",
  "problemSolved": "string | null (max 200 chars)",
  "techStack": ["string"],
  "builderContribution": "string | null (what THIS builder did — infer from team section if needed, max 250 chars)",
  "githubUrl": "string | null",
  "demoUrl": "string | null",
  "videoDemoUrl": "string | null",
  "awardOrRanking": "string | null"
}`;

const DEVPOST_SOFTWARE_RE = /devpost\.com\/software\/[a-z0-9-]+/i;
const GENERIC_DEVPOST_SLUGS = new Set([
  'built-with',
  'popular',
  'featured',
  'trending',
  'new',
  'hackathons',
  'projects',
]);

export function isDevpostProjectUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url) || url);
    if (parsed.hostname.replace(/^www\./, '') !== 'devpost.com') return false;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'software' || !parts[1]) return false;
    return !GENERIC_DEVPOST_SLUGS.has(parts[1].toLowerCase());
  } catch {
    if (!DEVPOST_SOFTWARE_RE.test(url)) return false;
    const slug = url.split('/software/')[1]?.split(/[/?#]/)[0]?.toLowerCase();
    return Boolean(slug && !GENERIC_DEVPOST_SLUGS.has(slug));
  }
}

export function isDevpostProfileUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized || !normalized.includes('devpost.com')) return false;
  if (isDevpostProjectUrl(normalized)) return false;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.replace(/^www\./, '') !== 'devpost.com') return false;
    // devpost.com/username or devpost.com/users/username
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return false;
    if (parts[0] === 'software' || parts[0] === 'challenges' || parts[0] === 'hackathons') return false;
    return true;
  } catch {
    return /devpost\.com\/(?:users\/)?[a-z0-9_-]+/i.test(normalized) && !DEVPOST_SOFTWARE_RE.test(normalized);
  }
}

export function extractDevpostProjectUrls(markdown: string, profileUrl: string): string[] {
  const fromLinks = extractLinksFromMarkdown(markdown, profileUrl);
  const found = new Set<string>();

  for (const url of fromLinks) {
    if (isDevpostProjectUrl(url)) {
      found.add(normalizeUrl(url) || url);
    }
  }

  for (const match of markdown.matchAll(/https?:\/\/[^\s)\]]*devpost\.com\/software\/[a-z0-9-]+/gi)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized && isDevpostProjectUrl(normalized)) found.add(normalized);
  }

  return [...found];
}

export async function enrichDevpostUrl(
  devpostUrl: string,
  builderName?: string
): Promise<EnrichedProjectDraft | null> {
  const normalized = normalizeUrl(devpostUrl);
  if (!normalized) return null;

  const chunk = await fetchUrlMarkdown(normalized, 'Devpost submission', 5000);
  if (!chunk) return null;

  let parsed: Record<string, unknown> = {
    projectName: 'Devpost Project',
    description: null,
    techStack: [],
  };

  if (hasOpenRouterConfig()) {
    const extraction = await generateOpenRouterReply({
      systemPrompt: DEVPOST_EXTRACT_PROMPT,
      userPrompt: `Builder name: ${builderName || 'unknown'}\n\n${chunk.markdown}`,
      temperature: 0,
      maxTokens: 700,
    });
    parsed = parseJsonResponse(extraction) || parsed;
  } else {
    const titleLine = chunk.markdown.split('\n').find((line) => line.startsWith('# '));
    if (titleLine) parsed.projectName = titleLine.replace(/^#\s+/, '').trim();
  }

  const imageMatches = Array.from(
    chunk.markdown.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/gi)
  );
  const screenshots =
    imageMatches
      .map((m) => m[1])
      .filter((u) => !/badge|logo|avatar|profile/i.test(u))
      .slice(0, 8)
      .join(', ') || null;

  return {
    projectName: String(parsed.projectName || 'Devpost Project'),
    description: typeof parsed.description === 'string' ? parsed.description : null,
    problemSolved: typeof parsed.problemSolved === 'string' ? parsed.problemSolved : null,
    techStack: Array.isArray(parsed.techStack)
      ? parsed.techStack.map(String).map((s) => s.trim()).filter(Boolean)
      : [],
    builderContribution:
      typeof parsed.builderContribution === 'string' ? parsed.builderContribution : null,
    links: {
      devpost: normalized,
      github: typeof parsed.githubUrl === 'string' ? parsed.githubUrl : null,
      demo: typeof parsed.demoUrl === 'string' ? parsed.demoUrl : null,
      videoDemo: typeof parsed.videoDemoUrl === 'string' ? parsed.videoDemoUrl : null,
      screenshots,
    },
    source: 'devpost_urltomarkdown',
    sourceId: normalized,
    verificationStatus: 'imported_unverified',
    confidence: 0.82,
  };
}

/** Crawl a Devpost profile page and enrich each linked /software/ project. */
export async function enrichDevpostProfile(
  profileUrl: string,
  builderName?: string,
  opts?: { maxProjects?: number }
): Promise<{ projects: EnrichedProjectDraft[]; projectUrls: string[]; errors: string[] }> {
  const normalized = normalizeUrl(profileUrl);
  if (!normalized) return { projects: [], projectUrls: [], errors: ['invalid_devpost_profile_url'] };

  const chunk = await fetchUrlMarkdown(normalized, 'Devpost profile', 12000);
  if (!chunk?.markdown) {
    return { projects: [], projectUrls: [], errors: ['devpost_profile_fetch_failed'] };
  }

  const projectUrls = extractDevpostProjectUrls(chunk.markdown, normalized).slice(0, opts?.maxProjects ?? 8);
  if (!projectUrls.length) {
    return { projects: [], projectUrls: [], errors: ['devpost_profile_no_projects_found'] };
  }

  const projects: EnrichedProjectDraft[] = [];
  const errors: string[] = [];

  for (const url of projectUrls) {
    try {
      const draft = await enrichDevpostUrl(url, builderName);
      if (draft) projects.push(draft);
      else errors.push(`devpost_empty:${url}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `devpost_failed:${url}`);
    }
  }

  return { projects, projectUrls, errors };
}

export async function enrichFromDevpost(
  builder: any,
  options?: {
    includeExistingProjects?: boolean;
    onProgress?: (brief: string) => void | Promise<void>;
  }
): Promise<SourceEnrichmentResult> {
  const projects: EnrichedProjectDraft[] = [];
  const errors: string[] = [];
  const meta: Record<string, unknown> = {};

  const targets = new Set<string>();
  if (builder?.links?.devpost) targets.add(builder.links.devpost);

  if (options?.includeExistingProjects !== false) {
    const existing = await ProjectRecord.find({
      builderId: builder._id,
      'links.devpost': { $exists: true, $nin: [null, ''] },
    })
      .select('links.devpost')
      .lean();

    for (const row of existing) {
      if (row.links?.devpost) targets.add(row.links.devpost);
    }
  }

  const profileUrls: string[] = [];
  const directProjectUrls: string[] = [];

  for (const url of targets) {
    if (isDevpostProfileUrl(url)) profileUrls.push(url);
    else if (isDevpostProjectUrl(url)) directProjectUrls.push(url);
    else profileUrls.push(url);
  }

  for (const profileUrl of profileUrls) {
    await options?.onProgress?.(`Fetching Devpost profile ${profileUrl}`);
    const result = await enrichDevpostProfile(profileUrl, builder?.name, { maxProjects: 8 });
    projects.push(...result.projects);
    errors.push(...result.errors);
    meta.profileUrl = profileUrl;
    meta.projectUrlsFound = result.projectUrls;
    if (result.projects.length) {
      await options?.onProgress?.(
        `Found ${result.projects.length} Devpost project${result.projects.length === 1 ? '' : 's'}`
      );
    }
  }

  for (const url of directProjectUrls) {
    try {
      const draft = await enrichDevpostUrl(url, builder?.name);
      if (draft) projects.push(draft);
      else errors.push(`devpost_empty:${url}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `devpost_failed:${url}`);
    }
  }

  const deduped = new Map<string, EnrichedProjectDraft>();
  for (const project of projects) {
    const key = project.sourceId || project.projectName.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, project);
  }

  return {
    source: 'devpost',
    projects: [...deduped.values()],
    errors: errors.length ? [...new Set(errors)] : undefined,
    meta: { ...meta, urlsProcessed: targets.size, projectsExtracted: deduped.size },
  };
}
