import { generateOpenRouterReply } from '@/lib/openrouter';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { getProjects, buildProfileSnapshot } from '@/lib/agent/builderProfileTools';
import {
  aggregateInferredSkills,
  refreshBuilderScores,
  upsertEnrichedProjects,
} from '@/lib/talent/builderEnrichment/apply';
import type { EnrichedProjectDraft } from '@/lib/talent/builderEnrichment/types';

export type ExtractedResumeProject = {
  projectName: string;
  description?: string | null;
  techStack?: string[];
  builderContribution?: string | null;
  links?: { github?: string | null; demo?: string | null };
};

export type ExtractedResume = {
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  currentStatus?: string | null;
  universityOrCompany?: string | null;
  graduationYear?: number | null;
  workAuthorization?: string | null;
  rolePreference?: string[];
  skills?: string[];
  links?: { github?: string | null; linkedin?: string | null; portfolio?: string | null };
  experiences?: Array<{
    title: string;
    company: string;
    dateRange?: string | null;
    description?: string | null;
    skills?: string[];
    isCurrent?: boolean;
  }>;
  projects?: ExtractedResumeProject[];
};

export type ResumeApplyResult = {
  added: string[];
  improved: string[];
  unchanged: string[];
  profileFieldsUpdated: string[];
  experiencesAdded: number;
  experiencesImproved: number;
  projectsCreated: number;
  projectsUpdated: number;
  newLinks: { github?: boolean; linkedin?: boolean };
  snapshot: ReturnType<typeof buildProfileSnapshot>;
  /** @deprecated use added/improved */
  applied: string[];
};

function markProfileField(fields: string[], name: string) {
  if (!fields.includes(name)) fields.push(name);
}

/** Normalize resumeEnricher LLM JSON into our ExtractedResume shape. */
export function recordToExtractedResume(raw: Record<string, unknown>): ExtractedResume {
  const links = (raw.links || {}) as Record<string, unknown>;
  return {
    headline: typeof raw.headline === 'string' ? raw.headline : null,
    bio: typeof raw.bio === 'string' ? raw.bio : null,
    location: typeof raw.location === 'string' ? raw.location : null,
    currentStatus: typeof raw.currentStatus === 'string' ? raw.currentStatus : null,
    universityOrCompany: typeof raw.universityOrCompany === 'string' ? raw.universityOrCompany : null,
    graduationYear: typeof raw.graduationYear === 'number' ? raw.graduationYear : null,
    workAuthorization: typeof raw.workAuthorization === 'string' ? raw.workAuthorization : null,
    rolePreference: Array.isArray(raw.rolePreference)
      ? raw.rolePreference.map(String).map((s) => s.trim()).filter(Boolean)
      : [],
    skills: Array.isArray(raw.skills)
      ? raw.skills.map(String).map((s) => s.trim()).filter(Boolean)
      : [],
    links: {
      github: typeof links.github === 'string' ? links.github : null,
      linkedin: typeof links.linkedin === 'string' ? links.linkedin : null,
      portfolio: typeof links.portfolio === 'string' ? links.portfolio : null,
    },
    experiences: Array.isArray(raw.experiences)
      ? raw.experiences
          .map((entry) => {
            const exp = entry as Record<string, unknown>;
            const title = typeof exp.title === 'string' ? exp.title.trim() : '';
            const company = typeof exp.company === 'string' ? exp.company.trim() : '';
            if (!title || !company) return null;
            return {
              title,
              company,
              dateRange: typeof exp.dateRange === 'string' ? exp.dateRange : null,
              description: typeof exp.description === 'string' ? exp.description : null,
              skills: Array.isArray(exp.skills)
                ? exp.skills.map(String).map((s) => s.trim()).filter(Boolean)
                : [],
              isCurrent: Boolean(exp.isCurrent),
            };
          })
          .filter(Boolean) as NonNullable<ExtractedResume['experiences']>
      : [],
    projects: Array.isArray(raw.projects)
      ? raw.projects
          .map((entry) => {
            const proj = entry as Record<string, unknown>;
            const projectName = typeof proj.projectName === 'string' ? proj.projectName.trim() : '';
            if (!projectName) return null;
            const projLinks = (proj.links || {}) as Record<string, unknown>;
            return {
              projectName,
              description: typeof proj.description === 'string' ? proj.description : null,
              techStack: Array.isArray(proj.techStack)
                ? proj.techStack.map(String).map((s) => s.trim()).filter(Boolean)
                : [],
              builderContribution:
                typeof proj.builderContribution === 'string' ? proj.builderContribution : null,
              links: {
                github: typeof projLinks.github === 'string' ? projLinks.github : null,
                demo: typeof projLinks.demo === 'string' ? projLinks.demo : null,
              },
            };
          })
          .filter(Boolean) as NonNullable<ExtractedResume['projects']>
      : [],
  };
}

/** Load builder and apply resume extraction with full enrichment writeback (scores, embeddings, search). */
export async function writeResumeExtractionToBuilder(
  builderId: string,
  extracted: ExtractedResume
): Promise<ResumeApplyResult> {
  const builder = await BuilderProfile.findById(builderId);
  if (!builder) throw new Error(`Builder not found: ${builderId}`);
  return applyResumeToBuilder(builder, extracted);
}

function compactKey(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function experienceMatchKey(title: string, company: string) {
  return `${compactKey(company)}|${compactKey(title)}`;
}

function isBetterText(incoming: string | null | undefined, existing: string | null | undefined) {
  const next = String(incoming || '').trim();
  const prev = String(existing || '').trim();
  if (!next) return false;
  if (!prev) return true;
  return next.length > prev.length + 20;
}

function mergeSkillLists(...groups: string[][]) {
  const merged = new Set<string>();
  for (const group of groups) {
    for (const skill of group || []) {
      const trimmed = String(skill || '').trim();
      if (trimmed) merged.add(trimmed);
    }
  }
  return Array.from(merged);
}

/** Turn raw resume bytes into plain text. Handles PDF + text; flags everything else. */
export async function resumeBytesToText(
  buffer: Buffer,
  contentType?: string | null,
  filename?: string | null
): Promise<string> {
  const name = (filename || '').toLowerCase();
  const type = (contentType || '').toLowerCase();
  const isPdf =
    type.includes('pdf') ||
    name.endsWith('.pdf') ||
    buffer.subarray(0, 5).toString('latin1') === '%PDF-';

  if (isPdf) {
    await import('@/lib/workerPolyfills');
    const pdf = (await import('pdf-parse')).default;
    const data = await pdf(buffer);
    const text = String(data.text || '').trim();
    if (!text) throw new Error('Could not read text from that PDF — try a text-based resume PDF.');
    return text;
  }

  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    return buffer.toString('utf8').replace(/\s+/g, ' ').trim();
  }

  throw new Error('Unsupported resume format. Send a PDF.');
}

/** LLM-extract structured BuilderProfile fields from resume text. */
export async function extractResumeFields(resumeText: string): Promise<ExtractedResume> {
  const trimmed = resumeText.replace(/\s+/g, ' ').trim().slice(0, 14000);
  if (trimmed.length < 120) {
    throw new Error('Resume text is too short to parse.');
  }

  const raw = await generateOpenRouterReply({
    systemPrompt: `You extract a builder's profile from their resume text. Return STRICT JSON only, no markdown.
Schema:
{
  "headline": string|null,
  "bio": string|null,
  "location": string|null,
  "currentStatus": "student"|"full_time"|"unemployed"|"founder"|"freelancer"|"other"|null,
  "universityOrCompany": string|null,
  "graduationYear": number|null,
  "workAuthorization": string|null,
  "rolePreference": string[],
  "skills": string[],
  "links": { "github": string|null, "linkedin": string|null, "portfolio": string|null },
  "experiences": [
    { "title": string, "company": string, "dateRange": string|null, "description": string|null, "skills": string[], "isCurrent": boolean }
  ],
  "projects": [
    {
      "projectName": string,
      "description": string|null,
      "techStack": string[],
      "builderContribution": string|null,
      "links": { "github": string|null, "demo": string|null }
    }
  ]
}
Rules:
- Only facts present in the resume. null / [] when unknown.
- Max 8 experiences (most recent first), max 4 projects (most relevant).
- skills = concrete tech (React, Python, Flutter) — not job titles.
- projects = shipped work, hackathons, capstones, notable repos — not every bullet on a job.`,
    userPrompt: `Resume text:\n\n${trimmed}`,
    temperature: 0,
    maxTokens: 2200,
    responseFormat: 'json_object',
  });

  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    return parsed as ExtractedResume;
  } catch {
    return {};
  }
}

/** Parse a resume PDF/attachment end-to-end. */
export async function parseResumeAttachment(
  buffer: Buffer,
  contentType?: string | null,
  filename?: string | null
): Promise<{ text: string; extracted: ExtractedResume }> {
  const text = await resumeBytesToText(buffer, contentType, filename);
  const extracted = await extractResumeFields(text);
  return { text, extracted };
}

function normalizeResumeExperience(
  exp: NonNullable<ExtractedResume['experiences']>[number],
  index: number
) {
  const title = String(exp?.title || '').trim();
  const company = String(exp?.company || '').trim();
  if (!title || !company) return null;
  return {
    title,
    company,
    dateRange: exp.dateRange?.trim() || null,
    description: exp.description?.trim() || null,
    skills: Array.isArray(exp.skills) ? exp.skills.map(String).map((s) => s.trim()).filter(Boolean) : [],
    isCurrent: Boolean(exp.isCurrent),
    source: 'resume',
    sourceId: `resume:${experienceMatchKey(title, company)}:${index}`,
    importedAt: new Date(),
  };
}

function mapResumeProjects(extracted: ExtractedResume): EnrichedProjectDraft[] {
  const projects: EnrichedProjectDraft[] = [];
  for (const raw of extracted.projects || []) {
    const projectName = String(raw?.projectName || '').trim();
    if (!projectName) continue;
    projects.push({
      projectName,
      description: raw.description?.trim() || null,
      techStack: Array.isArray(raw.techStack)
        ? raw.techStack.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12)
        : [],
      builderContribution: raw.builderContribution?.trim() || null,
      links: {
        github: raw.links?.github?.trim() || null,
        demo: raw.links?.demo?.trim() || null,
      },
      source: 'resume_imessage',
      sourceId: `resume:${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      verificationStatus: 'imported_unverified',
      confidence: 0.82,
    });
  }
  return projects.slice(0, 4);
}

/**
 * Cross-check resume extraction against the existing profile.
 * Fills gaps, enriches thin fields, and imports projects — never blindly overwrites
 * stronger data the builder already has from LinkedIn/GitHub.
 */
export async function applyResumeToBuilder(builder: any, extracted: ExtractedResume): Promise<ResumeApplyResult> {
  const added: string[] = [];
  const improved: string[] = [];
  const unchanged: string[] = [];
  const profileFieldsUpdated: string[] = [];
  const newLinks: { github?: boolean; linkedin?: boolean } = {};

  if (!builder.headline && extracted.headline) {
    builder.headline = extracted.headline.slice(0, 120);
    added.push('headline');
    markProfileField(profileFieldsUpdated, 'headline');
  } else if (isBetterText(extracted.headline, builder.headline)) {
    builder.headline = String(extracted.headline).slice(0, 120);
    improved.push('headline');
    markProfileField(profileFieldsUpdated, 'headline');
  } else if (extracted.headline) {
    unchanged.push('headline');
  }

  if (!builder.bio && extracted.bio) {
    builder.bio = extracted.bio.slice(0, 2000);
    added.push('bio');
    markProfileField(profileFieldsUpdated, 'bio');
  } else if (isBetterText(extracted.bio, builder.bio)) {
    builder.bio = String(extracted.bio).slice(0, 2000);
    improved.push('bio');
    markProfileField(profileFieldsUpdated, 'bio');
  } else if (extracted.bio) {
    unchanged.push('bio');
  }

  if (!builder.location && extracted.location) {
    builder.location = extracted.location;
    added.push('location');
    markProfileField(profileFieldsUpdated, 'location');
  } else if (extracted.location) unchanged.push('location');

  if (!builder.universityOrCompany && extracted.universityOrCompany) {
    builder.universityOrCompany = extracted.universityOrCompany;
    added.push('school/company');
    markProfileField(profileFieldsUpdated, 'universityOrCompany');
  } else if (extracted.universityOrCompany) unchanged.push('school/company');

  if (!builder.graduationYear && typeof extracted.graduationYear === 'number') {
    builder.graduationYear = extracted.graduationYear;
    added.push('grad year');
    markProfileField(profileFieldsUpdated, 'graduationYear');
  } else if (extracted.graduationYear) unchanged.push('grad year');

  if (!builder.workAuthorization && extracted.workAuthorization) {
    builder.workAuthorization = extracted.workAuthorization;
    added.push('work authorization');
    markProfileField(profileFieldsUpdated, 'workAuthorization');
  } else if (extracted.workAuthorization) unchanged.push('work authorization');

  if (
    extracted.currentStatus &&
    ['student', 'full_time', 'unemployed', 'founder', 'freelancer', 'other'].includes(extracted.currentStatus)
  ) {
    if (!builder.currentStatus) {
      builder.currentStatus = extracted.currentStatus;
      added.push('current status');
      markProfileField(profileFieldsUpdated, 'currentStatus');
    }
  }

  if (extracted.rolePreference?.length) {
    const before = builder.rolePreference || [];
    const merged = mergeSkillLists(before, extracted.rolePreference).slice(0, 8);
    if (merged.length > before.length) {
      builder.rolePreference = merged;
      added.push(`${merged.length - before.length} role preferences`);
      markProfileField(profileFieldsUpdated, 'rolePreference');
    }
  }

  if (extracted.skills?.length) {
    const before = builder.skills || [];
    const merged = mergeSkillLists(before, extracted.skills).slice(0, 32);
    if (merged.length > before.length) {
      builder.skills = merged;
      added.push(`${merged.length - before.length} skills`);
      markProfileField(profileFieldsUpdated, 'skills');
    } else if (merged.length === before.length) {
      unchanged.push('skills');
    }
  }

  builder.links = builder.links || {};
  if (!builder.links.github && extracted.links?.github) {
    builder.links.github = extracted.links.github;
    added.push('GitHub link');
    newLinks.github = true;
    markProfileField(profileFieldsUpdated, 'links.github');
  }
  if (!builder.links.linkedin && extracted.links?.linkedin) {
    builder.links.linkedin = extracted.links.linkedin;
    added.push('LinkedIn link');
    newLinks.linkedin = true;
    markProfileField(profileFieldsUpdated, 'links.linkedin');
  }
  if (!builder.links.portfolio && extracted.links?.portfolio) {
    builder.links.portfolio = extracted.links.portfolio;
    added.push('portfolio link');
    markProfileField(profileFieldsUpdated, 'links.portfolio');
  }
  builder.links.resume = builder.links.resume || 'imessage:attachment';

  builder.experiences = builder.experiences || [];
  let experiencesAdded = 0;
  let experiencesImproved = 0;

  for (const [index, rawExp] of (extracted.experiences || []).slice(0, 8).entries()) {
    const normalized = normalizeResumeExperience(rawExp, index);
    if (!normalized) continue;

    const key = experienceMatchKey(normalized.title, normalized.company);
    const existing = builder.experiences.find((entry: any) => {
      const entryKey = experienceMatchKey(String(entry?.title || ''), String(entry?.company || ''));
      return entryKey === key;
    });

    if (!existing) {
      builder.experiences.push(normalized);
      experiencesAdded += 1;
      continue;
    }

    let touched = false;
    if (!existing.dateRange && normalized.dateRange) {
      existing.dateRange = normalized.dateRange;
      touched = true;
    }
    if (isBetterText(normalized.description, existing.description)) {
      existing.description = normalized.description;
      touched = true;
    }
    const mergedSkills = mergeSkillLists(existing.skills || [], normalized.skills);
    if (mergedSkills.length > (existing.skills || []).length) {
      existing.skills = mergedSkills;
      touched = true;
    }
    if (normalized.isCurrent && !existing.isCurrent) {
      existing.isCurrent = true;
      touched = true;
    }
    if (touched) experiencesImproved += 1;
  }

  if (experiencesAdded) added.push(`${experiencesAdded} experience${experiencesAdded === 1 ? '' : 's'}`);
  if (experiencesImproved) improved.push(`${experiencesImproved} experience detail${experiencesImproved === 1 ? '' : 's'}`);
  if (experiencesAdded || experiencesImproved) markProfileField(profileFieldsUpdated, 'experiences');

  await builder.save();

  const resumeProjects = mapResumeProjects(extracted);
  let projectsCreated = 0;
  let projectsUpdated = 0;
  if (resumeProjects.length) {
    const counts = await upsertEnrichedProjects(builder._id, resumeProjects, { overwriteImported: false });
    projectsCreated = counts.created;
    projectsUpdated = counts.updated;
    if (projectsCreated) added.push(`${projectsCreated} project${projectsCreated === 1 ? '' : 's'}`);
    if (projectsUpdated) improved.push(`${projectsUpdated} project detail${projectsUpdated === 1 ? '' : 's'}`);
  }

  await aggregateInferredSkills(builder._id);
  const refreshed = await refreshBuilderScores(builder._id);
  const snapshotBuilder = refreshed || builder;
  const snapshot = buildProfileSnapshot(snapshotBuilder, await getProjects(builder._id));

  const applied = [...added, ...improved];
  return {
    added,
    improved,
    unchanged,
    profileFieldsUpdated,
    experiencesAdded,
    experiencesImproved,
    projectsCreated,
    projectsUpdated,
    newLinks,
    snapshot,
    applied,
  };
}
