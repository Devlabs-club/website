import ProjectRecord from '@/models/talent/ProjectRecord';
import EventRecord from '@/models/talent/EventRecord';
import MomentumUpdate from '@/models/talent/MomentumUpdate';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { upsertBuilderEmbedding, upsertProjectEmbedding } from '@/lib/talent/embeddings/upsertTalentEmbedding';
import { upsertBuilderEmbeddingV2 } from '@/lib/talent/embeddings/upsertTalentEmbeddingV2';
import { scheduleTalentStatsRefresh } from '@/lib/talent/talentDatabaseStats';
import { computeBuilderScores } from '@/lib/talent/matching';
import { evaluateBuilderProfileQuality } from '@/lib/talent/profileQuality';
import { upsertTalentSearchIndexForBuilder } from '@/lib/talent/searchIndex';
import { resolveBuilderBaseLocation } from '@/lib/talent/builderLocation';
import { generateOpenRouterReply } from '@/lib/openrouter';
import { fetchUrlMarkdown, normalizeUrl } from '@/lib/talent/builderEnrichment/urlToMarkdown';
import { updateUserAccount, findUserByEmail } from '@/lib/adminMongo';
import {
  dedupeBuilderProfileCollections,
  mergeExperiences as mergeExperienceEntries,
  mergeStringList,
  normalizedProjectName,
} from '@/lib/talent/profileDedup';
import type { RuntimeEnv } from '@/lib/workosEnv';
import type { EnrichmentSource } from '@/lib/talent/builderEnrichment';

/**
 * Shared builder-profile read/write operations.
 *
 * These are the structured backend tools the iMessage builder-care agent uses
 * to read, update, create, and enrich a BuilderProfile. Each writer persists
 * the change, recomputes completion/quality scores, and refreshes embeddings +
 * search index so the profile stays founder-discoverable.
 */

export async function reloadBuilder(builderId: unknown) {
  return BuilderProfile.findById(builderId);
}

export async function getProjects(builderId: unknown) {
  return ProjectRecord.find({ builderId })
    .select('projectName description techStack builderContribution verificationStatus source links status')
    .lean();
}

/** Recompute completion + quality, persist, and refresh the search index. */
export async function updateBuilderScores(builder: any) {
  dedupeBuilderProfileCollections(builder);
  const [projects, events, momentum] = await Promise.all([
    ProjectRecord.find({ builderId: builder._id }).lean(),
    EventRecord.find({ builderId: builder._id }).lean(),
    MomentumUpdate.find({ builderId: builder._id }).lean(),
  ]);
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  try {
    const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
    builder.profileQuality = quality;
    builder.profileQuality.evaluatedAt = new Date();
  } catch (err) {
    console.error('[builderProfileTools] quality eval failed:', err);
  }
  await builder.save();
  await upsertTalentSearchIndexForBuilder(builder._id);
  return completion;
}

/** A compact, founder-readable snapshot of everything we know about the builder. */
export function buildProfileSnapshot(builder: any, projects: any[]) {
  const completion = computeBuilderScores(builder, projects);
  return {
    name: builder.name,
    avatarUrl: builder.avatarUrl || null,
    headline: builder.headline || null,
    bio: builder.bio || null,
    location: resolveBuilderBaseLocation(builder).text || builder.location || null,
    timezone: builder.timezone || null,
    currentStatus: builder.currentStatus || null,
    universityOrCompany: builder.universityOrCompany || null,
    graduationYear: builder.graduationYear || null,
    workAuthorization: builder.workAuthorization || null,
    rolePreference: builder.rolePreference || [],
    skills: builder.skills || [],
    preferredWorkType: builder.preferredWorkType || [],
    links: {
      github: builder.links?.github || null,
      linkedin: builder.links?.linkedin || null,
      portfolio: builder.links?.portfolio || null,
      personalWebsite: builder.links?.personalWebsite || null,
      devpost: builder.links?.devpost || null,
      twitter: builder.links?.twitter || null,
      resume: builder.links?.resume || null,
    },
    availability: {
      availableNow: builder.availability?.availableNow ?? false,
      remotePreference: builder.availability?.remotePreference ?? 'unspecified',
      desiredCompensation: builder.availability?.desiredCompensation ?? null,
      earliestStartDate: builder.availability?.earliestStartDate ?? null,
    },
    experiences: (builder.experiences || []).map((e: any) => ({
      title: e.title,
      company: e.company,
      dateRange: e.dateRange || null,
      description: e.description || null,
      skills: e.skills || [],
      isCurrent: !!e.isCurrent,
    })),
    projects: projects.map((p: any) => ({
      id: String(p._id),
      title: p.projectName,
      description: p.description || null,
      techStack: p.techStack || [],
      contribution: p.builderContribution || null,
      status: p.status || null,
    })),
    projectCount: projects.length,
    profileScore: completion.profileScore,
    proofScore: completion.proofScore,
    missingFields: completion.missingItems || [],
    qualityScore: builder.profileQuality?.overallScore ?? null,
    qualityLabel: builder.profileQuality?.label ?? null,
    qualitySummary: builder.profileQuality?.oneLineSummary ?? null,
    qualityIssues: (builder.profileQuality?.issues || []).slice(0, 4).map((i: any) => i.title),
    verificationStatus: builder.verificationStatus,
  };
}

export async function updateProfileBasics(builder: any, args: { headline?: string; bio?: string }) {
  if (typeof args.headline === 'string') builder.headline = args.headline.trim() || null;
  if (typeof args.bio === 'string') builder.bio = args.bio.trim() || null;
  await builder.save();
  await updateBuilderScores(builder);
  scheduleTalentStatsRefresh();
  return { headline: builder.headline, bio: builder.bio };
}

const PROFILE_LINK_FIELDS = new Set(['github', 'linkedin', 'portfolio', 'personalWebsite', 'resume', 'devpost', 'twitter']);

function normalizeProfileLink(field: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new Error(`links.${field} must be a URL string.`);
  }
  const normalized = normalizeUrl(value.trim());
  if (!normalized) {
    throw new Error(`links.${field} must be a valid URL, got "${value}".`);
  }

  let host = '';
  let path = '';
  try {
    const parsed = new URL(normalized);
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    path = parsed.pathname;
  } catch {
    throw new Error(`links.${field} must be a valid URL, got "${value}".`);
  }

  const matches = (expected: string) => host === expected || host.endsWith(`.${expected}`);
  if (field === 'github' && host !== 'github.com') throw new Error('links.github must be a github.com URL.');
  if (field === 'linkedin' && !matches('linkedin.com')) throw new Error('links.linkedin must be a linkedin.com URL.');
  if (field === 'devpost' && host !== 'devpost.com') throw new Error('links.devpost must be a devpost.com URL.');
  if (field === 'twitter' && host !== 'twitter.com' && host !== 'x.com') throw new Error('links.twitter must be an x.com or twitter.com URL.');
  if (field === 'resume' && !/\.pdf($|[?#])/i.test(normalized)) throw new Error('links.resume must point to a PDF URL.');
  if ((field === 'portfolio' || field === 'personalWebsite') && PROFILE_LINK_FIELDS.has(field) && !host.includes('.')) {
    throw new Error(`links.${field} must be a valid website URL.`);
  }
  if (field === 'linkedin' && !path.startsWith('/in/')) {
    throw new Error('links.linkedin must point to a LinkedIn profile URL.');
  }

  return normalized;
}

function normalizeLinkPatch(linkPatch: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(linkPatch)) {
    if (!PROFILE_LINK_FIELDS.has(field)) {
      normalized[field] = value;
      continue;
    }
    normalized[field] = normalizeProfileLink(field, value);
  }
  return normalized;
}

export async function updateLinks(builder: any, args: { github?: string; linkedin?: string; portfolio?: string; resume?: string; devpost?: string; personalWebsite?: string; twitter?: string }) {
  const links = normalizeLinkPatch(args as Record<string, unknown>);
  builder.links = {
    ...builder.links,
    ...(typeof links.github === 'string' ? { github: links.github } : {}),
    ...(typeof links.linkedin === 'string' ? { linkedin: links.linkedin } : {}),
    ...(typeof links.portfolio === 'string' ? { portfolio: links.portfolio } : {}),
    ...(typeof links.resume === 'string' ? { resume: links.resume } : {}),
    ...(typeof links.devpost === 'string' ? { devpost: links.devpost } : {}),
    ...(typeof links.personalWebsite === 'string' ? { personalWebsite: links.personalWebsite } : {}),
    ...(typeof links.twitter === 'string' ? { twitter: links.twitter } : {}),
  };
  await updateBuilderScores(builder);
  scheduleTalentStatsRefresh();
  return builder.links;
}

export async function updateAvailability(builder: any, args: { availableNow?: boolean; remotePreference?: string; desiredCompensation?: string }) {
  builder.availability = {
    ...builder.availability,
    ...(typeof args.availableNow === 'boolean' ? { availableNow: args.availableNow, refreshedAt: new Date() } : {}),
    ...(typeof args.remotePreference === 'string' ? { remotePreference: args.remotePreference } : {}),
    ...(typeof args.desiredCompensation === 'string' ? { desiredCompensation: args.desiredCompensation } : {}),
  };
  await updateBuilderScores(builder);
  scheduleTalentStatsRefresh();
  return builder.availability;
}

export async function updateProfileDetails(
  builder: any,
  args: {
    location?: string;
    timezone?: string;
    currentStatus?: string;
    universityOrCompany?: string;
    graduationYear?: number;
    workAuthorization?: string;
    rolePreference?: string[];
    preferredWorkType?: string[];
  }
) {
  if (typeof args.location === 'string') builder.location = args.location.trim() || null;
  if (typeof args.timezone === 'string') builder.timezone = args.timezone.trim() || null;
  if (typeof args.currentStatus === 'string') builder.currentStatus = args.currentStatus;
  if (typeof args.universityOrCompany === 'string') builder.universityOrCompany = args.universityOrCompany.trim() || null;
  if (typeof args.graduationYear === 'number') builder.graduationYear = args.graduationYear;
  if (typeof args.workAuthorization === 'string') builder.workAuthorization = args.workAuthorization.trim() || null;
  if (Array.isArray(args.rolePreference)) builder.rolePreference = mergeStringList([], args.rolePreference);
  if (Array.isArray(args.preferredWorkType)) builder.preferredWorkType = mergeStringList([], args.preferredWorkType);
  await builder.save();
  await updateBuilderScores(builder);
  scheduleTalentStatsRefresh();
  return buildProfileSnapshot(builder, await getProjects(builder._id));
}

/** Add or update a work/role experience. De-dupes on title+company. */
export async function addExperience(
  builder: any,
  args: { title: string; company: string; dateRange?: string; description?: string; skills?: string[]; isCurrent?: boolean }
) {
  if (!args.title?.trim() || !args.company?.trim()) {
    throw new Error('Experience needs both a title and a company.');
  }
  const sourceId = `imessage:${args.company.trim().toLowerCase()}:${args.title.trim().toLowerCase()}`;
  builder.experiences = builder.experiences || [];
  const existing = builder.experiences.find((e: any) => e.sourceId === sourceId);
  const entry = {
    title: args.title.trim(),
    company: args.company.trim(),
    dateRange: args.dateRange?.trim() || null,
    description: args.description?.trim() || null,
    skills: Array.isArray(args.skills) ? args.skills.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : [],
    isCurrent: !!args.isCurrent,
    source: 'imessage',
    sourceId,
    importedAt: new Date(),
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    builder.experiences.push(entry);
  }
  await builder.save();
  await updateBuilderScores(builder);
  const projects = await getProjects(builder._id);
  void upsertBuilderEmbedding({ builderId: String(builder._id), builder, projects });
  void upsertBuilderEmbeddingV2({ builderId: String(builder._id), builder, projects }).catch((err) =>
    console.warn('[builderProfileTools] v2 embed failed', err instanceof Error ? err.message : err)
  );
  scheduleTalentStatsRefresh();
  return { experienceCount: builder.experiences.length, added: entry.title + ' @ ' + entry.company };
}

export async function evaluateProfile(builder: any) {
  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const events = await EventRecord.find({ builderId: builder._id }).lean();
  const momentum = await MomentumUpdate.find({ builderId: builder._id }).lean();
  const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
  builder.profileQuality = quality;
  builder.profileQuality.evaluatedAt = new Date();
  await builder.save();
  return {
    overallScore: quality.overallScore,
    label: quality.label,
    summary: quality.oneLineSummary,
    issues: (quality.issues || []).slice(0, 5).map((i: any) => ({ field: i.field, title: i.title, detail: i.detail })),
    suggestedFixes: (quality.suggestedFixes || []).slice(0, 4).map((f: any) => f.action),
  };
}

// ── General schema-aware patch (builder + projects + user) ───────────────────

/** Flatten a nested object into dot-notation keys for $set; arrays kept as values. */
function flattenForSet(obj: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      flattenForSet(v as Record<string, unknown>, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function normalizeBuilderPatchLinks(builderPatch: Record<string, unknown>) {
  const nestedLinks = builderPatch.links;
  if (nestedLinks && typeof nestedLinks === 'object' && !Array.isArray(nestedLinks)) {
    builderPatch.links = normalizeLinkPatch(nestedLinks as Record<string, unknown>);
  }

  for (const [key, value] of Object.entries(builderPatch)) {
    if (!key.startsWith('links.')) continue;
    const field = key.slice('links.'.length);
    if (!PROFILE_LINK_FIELDS.has(field)) continue;
    builderPatch[key] = normalizeProfileLink(field, value);
  }
}

const LINK_TO_SOURCE: Record<string, EnrichmentSource> = {
  github: 'github',
  linkedin: 'linkedin',
  devpost: 'devpost',
  portfolio: 'portfolio',
  personalWebsite: 'portfolio',
  twitter: 'twitter',
};

function toPlain(e: any) {
  return e && typeof e.toObject === 'function' ? e.toObject() : { ...e };
}

/** Merge experiences without clobbering existing ones; guarantee valid subdocs (sourceId/source). */
function mergeExperiences(existing: any[], incoming: any[]) {
  return mergeExperienceEntries(existing, incoming, 'imessage');
}

/** Merge education, dedup by school+degree+field. */
function mergeEducation(existing: any[], incoming: any[]) {
  const key = (e: any) => `${String(e.school || '').toLowerCase()}|${String(e.degree || '').toLowerCase()}|${String(e.field || '').toLowerCase()}`;
  const byKey = new Map<string, any>((existing || []).map((e) => { const p = toPlain(e); return [key(p), p]; }));
  for (const raw of incoming) {
    if (!raw || !raw.school) continue;
    const prev = byKey.get(key(raw)) || {};
    byKey.set(key(raw), { ...prev, ...raw, source: raw.source || prev.source || 'imessage', importedAt: new Date() });
  }
  return [...byKey.values()];
}

export type BuilderDataPatch = {
  builder?: Record<string, unknown>;
  projects?: Array<Record<string, unknown>>;
  user?: Record<string, unknown>;
};

/**
 * Apply a single structured patch across EVERYTHING owned by this builder —
 * their BuilderProfile, their ProjectRecords, and their User account — then run
 * the full post-write pipeline (scores, quality, embeddings, search index) so
 * nothing is bypassed. Scoped to this builder only. This is the agent's one
 * general write tool, so it has full power without per-field plumbing.
 *
 * Returns which github/linkedin/devpost/portfolio links changed so the caller
 * can schedule background enrichment, mirroring the old update_links behavior.
 */
export async function applyBuilderDataPatch(
  builderId: string,
  patch: BuilderDataPatch,
  runtime?: RuntimeEnv
): Promise<{ builderUpdated: string[]; projectsWritten: number; userUpdated: string[]; linksChanged: EnrichmentSource[] }> {
  const builder = await BuilderProfile.findById(builderId);
  if (!builder) throw new Error('Builder not found.');

  const result = { builderUpdated: [] as string[], projectsWritten: 0, userUpdated: [] as string[], linksChanged: [] as EnrichmentSource[] };

  // 1) Builder profile fields (dot-notation, any depth).
  if (patch.builder && typeof patch.builder === 'object') {
    const builderPatch: Record<string, unknown> = { ...patch.builder };
    normalizeBuilderPatchLinks(builderPatch);
    // experiences/education merge instead of clobbering, and stay valid (sourceId/source).
    const expPatch = builderPatch.experiences;
    const eduPatch = builderPatch.education;
    delete builderPatch.experiences;
    delete builderPatch.education;

    const flat = flattenForSet(builderPatch);
    if (Array.isArray(flat.skills)) flat.skills = mergeStringList([], flat.skills as unknown[]);
    if (Array.isArray(flat.rolePreference)) flat.rolePreference = mergeStringList([], flat.rolePreference as unknown[]);
    if (Array.isArray(flat.preferredWorkType)) flat.preferredWorkType = mergeStringList([], flat.preferredWorkType as unknown[]);
    if (Array.isArray(expPatch)) flat.experiences = mergeExperiences(builder.experiences || [], expPatch);
    if (Array.isArray(eduPatch)) flat.education = mergeEducation(builder.education || [], eduPatch);
    const keys = Object.keys(flat);
    if (keys.length) {
      await BuilderProfile.updateOne({ _id: builder._id }, { $set: flat });
      result.builderUpdated = keys;
      if (typeof flat.avatarUrl === 'string' && flat.avatarUrl.trim()) {
        let userId: string | null = builder.userId ? String(builder.userId) : null;
        if (!userId && builder.email) {
          const user = await findUserByEmail(builder.email, runtime);
          userId = user?._id ? String(user._id) : null;
        }
        if (userId) {
          await updateUserAccount(userId, { avatarUrl: flat.avatarUrl.trim() }, runtime);
          if (!result.userUpdated.includes('avatarUrl')) result.userUpdated.push('avatarUrl');
        }
      }
      for (const key of keys) {
        if (key.startsWith('links.')) {
          const linkName = key.slice('links.'.length);
          const src = LINK_TO_SOURCE[linkName];
          if (src && typeof flat[key] === 'string' && (flat[key] as string).trim() && !result.linksChanged.includes(src)) {
            result.linksChanged.push(src);
          }
        }
      }
    }
  }

  // 2) Projects (patch by id, else upsert by name). Scoped to this builder.
  for (const p of patch.projects || []) {
    const { id, projectName, ...rest } = p as Record<string, unknown>;
    const flat = flattenForSet(rest as Record<string, unknown>);
    if (projectName && typeof projectName === 'string') {
      flat.projectName = projectName;
      flat.projectNameKey = normalizedProjectName(projectName);
    }

    let saved: any = null;
    if (id && typeof id === 'string') {
      saved = await ProjectRecord.findOneAndUpdate(
        { _id: id, builderId: builder._id },
        { $set: { ...flat, verificationStatus: 'builder_confirmed' } },
        { new: true }
      );
    } else if (projectName && typeof projectName === 'string') {
      const sourceId = `imessage:${projectName.trim().toLowerCase()}`;
      const projectNameKey = normalizedProjectName(projectName);
      const existing = await ProjectRecord.findOne({ builderId: builder._id, projectNameKey });
      saved = await ProjectRecord.findOneAndUpdate(
        existing ? { _id: existing._id, builderId: builder._id } : { builderId: builder._id, sourceId },
        { $set: { ...flat, builderId: builder._id, source: 'imessage', sourceId, verificationStatus: 'builder_confirmed' } },
        { upsert: true, new: true }
      );
    }
    if (saved) {
      result.projectsWritten += 1;
      void upsertProjectEmbedding({ projectId: String(saved._id), builderId, project: saved });
    }
  }

  // 3) User account.
  if (patch.user && typeof patch.user === 'object' && Object.keys(patch.user).length) {
    let userId: string | null = builder.userId ? String(builder.userId) : null;
    if (!userId && builder.email) {
      const user = await findUserByEmail(builder.email, runtime);
      userId = user?._id ? String(user._id) : null;
    }
    if (userId) {
      await updateUserAccount(userId, patch.user as any, runtime);
      result.userUpdated = Object.keys(patch.user);
    }
  }

  // 4) Post-write pipeline so scores / search index / embeddings stay correct.
  const fresh = await BuilderProfile.findById(builderId);
  if (fresh) {
    await updateBuilderScores(fresh);
    const projects = await getProjects(builderId);
    void upsertBuilderEmbedding({ builderId, builder: fresh, projects });
    void upsertBuilderEmbeddingV2({ builderId, builder: fresh, projects }).catch((err) =>
      console.warn('[builderProfileTools] v2 embed failed', err instanceof Error ? err.message : err)
    );
    scheduleTalentStatsRefresh();
  }

  return result;
}

// ── Project import (GitHub / Devpost) ────────────────────────────────────────

function normalizeProjectUrl(input: string) {
  const parsed = new URL(input);
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

function getAllowedProjectSource(input: string) {
  const normalizedUrl = normalizeProjectUrl(input);
  const parsed = new URL(normalizedUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const isDevpost = hostname === 'devpost.com' && /^\/software\/[^/]+\/?$/.test(parsed.pathname);
  const isGithub = hostname === 'github.com' && /^\/[^/]+\/[^/]+\/?$/.test(parsed.pathname);
  return { normalizedUrl, isDevpost, isGithub };
}

export async function importProject(url: string, builderId: any) {
  const { normalizedUrl, isDevpost, isGithub } = getAllowedProjectSource(url);

  const projectData = {
    projectName: '',
    description: null as string | null,
    techStack: [] as string[],
    links: { devpost: null as string | null, github: null as string | null, demo: null as string | null, screenshots: null as string | null },
  };

  if (isDevpost) {
    const mdChunk = await fetchUrlMarkdown(normalizedUrl, 'Devpost', 6000);
    if (!mdChunk?.markdown) throw new Error('Failed to fetch Devpost page as markdown');
    const markdown = mdChunk.markdown;

    const imageMatches = Array.from(markdown.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/gi));
    const imageUrl = imageMatches.map((m) => m[1]).find((u) => !/badge|logo|avatar|profile/i.test(u)) || imageMatches[0]?.[1] || null;

    const extraction = await generateOpenRouterReply({
      systemPrompt: 'Extract project details from Devpost markdown. Return strict JSON: projectName (string), description (string max 300 chars), techStack (string[]), githubUrl (string|null), demoUrl (string|null). No markdown.',
      userPrompt: `Extract from:\n\n${markdown.substring(0, 4000)}`,
      temperature: 0,
      maxTokens: 500,
    });
    const parsed = JSON.parse(extraction.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    projectData.projectName = parsed.projectName || 'Devpost Project';
    projectData.description = parsed.description || null;
    projectData.techStack = Array.isArray(parsed.techStack) ? parsed.techStack : [];
    projectData.links.devpost = normalizedUrl;
    projectData.links.github = typeof parsed.githubUrl === 'string' ? parsed.githubUrl : null;
    projectData.links.demo = typeof parsed.demoUrl === 'string' ? parsed.demoUrl : null;
    projectData.links.screenshots = imageUrl;
  } else if (isGithub) {
    const match = normalizedUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
    if (!match) throw new Error('Invalid GitHub URL');
    const [, owner, repo] = match;
    const [repoRes, langRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`),
      fetch(`https://api.github.com/repos/${owner}/${repo}/languages`),
    ]);
    if (!repoRes.ok) throw new Error(`GitHub API: HTTP ${repoRes.status}`);
    const data = await repoRes.json();
    projectData.projectName = data.name || 'GitHub Project';
    projectData.description = data.description || null;
    projectData.links.github = data.html_url || normalizedUrl;
    projectData.links.demo = data.homepage || null;
    projectData.links.screenshots = data.owner?.avatar_url || null;
    if (langRes.ok) {
      const langs = await langRes.json();
      projectData.techStack = Object.keys(langs).slice(0, 5);
    }
  } else {
    throw new Error('Only Devpost and GitHub links are supported for import.');
  }

  const project = await ProjectRecord.findOneAndUpdate(
    { builderId, sourceId: normalizedUrl },
    {
      $set: {
        builderId,
        projectName: projectData.projectName,
        description: projectData.description,
        techStack: projectData.techStack,
        'links.devpost': projectData.links.devpost,
        'links.github': projectData.links.github,
        'links.demo': projectData.links.demo,
        'links.screenshots': projectData.links.screenshots,
        sourceId: normalizedUrl,
        source: isDevpost ? 'devpost_urltomarkdown' : 'github_api',
        verificationStatus: 'builder_confirmed',
      },
    },
    { upsert: true, new: true }
  );

  void upsertProjectEmbedding({ projectId: String(project._id), builderId: String(builderId), project });
  scheduleTalentStatsRefresh();
  return project;
}
