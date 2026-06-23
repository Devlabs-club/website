import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { computeBuilderScores } from '@/lib/talent/matching';
import { evaluateBuilderProfileQuality } from '@/lib/talent/profileQuality';
import { scheduleTalentStatsRefresh } from '@/lib/talent/talentDatabaseStats';
import { upsertBuilderEmbedding, upsertProjectEmbedding } from '@/lib/talent/embeddings/upsertTalentEmbedding';
import { upsertTalentSearchIndexForBuilder } from '@/lib/talent/searchIndex';
import type { EnrichedProfileDraft, EnrichedProjectDraft } from './types';

const CONFIRMED_STATUSES = new Set([
  'builder_confirmed',
  'peer_confirmed',
  'admin_verified',
  'founder_verified',
]);

function isEmpty(value: unknown) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function mergeSkills(existing: string[] = [], incoming: string[] = []) {
  const merged = new Set(existing.map((s) => s.trim()).filter(Boolean));
  incoming.forEach((skill) => {
    const trimmed = skill.trim();
    if (trimmed) merged.add(trimmed);
  });
  return Array.from(merged);
}

function normalizeEducationEntry(entry: any) {
  const school = typeof entry?.school === 'string' ? entry.school.trim() : '';
  const degree = typeof entry?.degree === 'string' ? entry.degree.trim() : '';
  const field = typeof entry?.field === 'string' ? entry.field.trim() : '';
  if (!school && !degree && !field) return null;
  return {
    school: school || null,
    degree: degree || null,
    field: field || null,
    source: typeof entry?.source === 'string' && entry.source.trim() ? entry.source.trim() : 'linkedin',
    importedAt: entry?.importedAt || new Date(),
  };
}

function educationKey(entry: any) {
  return [entry?.school, entry?.degree, entry?.field]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|');
}

function mergeEducation(existing: any[] = [], incoming: any[] = []) {
  const merged = new Map<string, any>();
  for (const entry of existing) {
    const normalized = normalizeEducationEntry(entry);
    if (normalized) merged.set(educationKey(normalized), normalized);
  }
  for (const entry of incoming) {
    const normalized = normalizeEducationEntry(entry);
    if (normalized) merged.set(educationKey(normalized), normalized);
  }
  return Array.from(merged.values()).slice(0, 8);
}

function normalizeExperienceEntry(entry: any, index = 0) {
  const title = typeof entry?.title === 'string' ? entry.title.trim() : '';
  const company = typeof entry?.company === 'string' ? entry.company.trim() : '';
  if (!title && !company) return null;

  const source = typeof entry?.source === 'string' && entry.source.trim() ? entry.source.trim() : 'linkedin';
  const sourceId =
    typeof entry?.sourceId === 'string' && entry.sourceId.trim()
      ? entry.sourceId.trim()
      : `${source}:${[title, company, entry?.dateRange].map((v) => String(v || '').trim().toLowerCase()).join('|') || index}`;

  return {
    title: title || 'Builder',
    company: company || 'Independent',
    companyLogoUrl: typeof entry?.companyLogoUrl === 'string' && entry.companyLogoUrl.trim() ? entry.companyLogoUrl.trim() : null,
    companyLinkedInUrl:
      typeof entry?.companyLinkedInUrl === 'string' && entry.companyLinkedInUrl.trim()
        ? entry.companyLinkedInUrl.trim()
        : null,
    employmentType:
      typeof entry?.employmentType === 'string' && entry.employmentType.trim() ? entry.employmentType.trim() : null,
    location: typeof entry?.location === 'string' && entry.location.trim() ? entry.location.trim() : null,
    dateRange: typeof entry?.dateRange === 'string' && entry.dateRange.trim() ? entry.dateRange.trim() : null,
    startDateLabel:
      typeof entry?.startDateLabel === 'string' && entry.startDateLabel.trim() ? entry.startDateLabel.trim() : null,
    endDateLabel: typeof entry?.endDateLabel === 'string' && entry.endDateLabel.trim() ? entry.endDateLabel.trim() : null,
    duration: typeof entry?.duration === 'string' && entry.duration.trim() ? entry.duration.trim() : null,
    description: typeof entry?.description === 'string' && entry.description.trim() ? entry.description.trim() : null,
    skills: Array.isArray(entry?.skills)
      ? entry.skills.map(String).map((skill: string) => skill.trim()).filter(Boolean)
      : [],
    isCurrent: Boolean(entry?.isCurrent),
    source,
    sourceId,
    importedAt: entry?.importedAt || new Date(),
  };
}

function experienceKey(entry: any) {
  return String(entry?.sourceId || '')
    || [entry?.title, entry?.company, entry?.dateRange]
      .map((value) => String(value || '').trim().toLowerCase())
      .join('|');
}

function mergeExperiences(existing: any[] = [], incoming: any[] = []) {
  const merged = new Map<string, any>();
  for (const [index, entry] of existing.entries()) {
    const normalized = normalizeExperienceEntry(entry, index);
    if (normalized) merged.set(experienceKey(normalized), normalized);
  }
  for (const [index, entry] of incoming.entries()) {
    const normalized = normalizeExperienceEntry(entry, index);
    if (normalized) merged.set(experienceKey(normalized), normalized);
  }
  return Array.from(merged.values()).slice(0, 10);
}

export async function applyProfileDraft(
  builder: any,
  draft: EnrichedProfileDraft,
  options?: { overwriteBasics?: boolean }
): Promise<string[]> {
  const updated: string[] = [];
  const overwrite = options?.overwriteBasics ?? false;

  if (!isEmpty(draft.headline) && (overwrite || isEmpty(builder.headline))) {
    builder.headline = String(draft.headline).trim().slice(0, 120);
    updated.push('headline');
  }
  if (!isEmpty(draft.bio) && (overwrite || isEmpty(builder.bio))) {
    builder.bio = String(draft.bio).trim().slice(0, 2000);
    updated.push('bio');
  }
  if (!isEmpty(draft.location) && (overwrite || isEmpty(builder.location))) {
    builder.location = String(draft.location).trim().slice(0, 120);
    updated.push('location');
  }
  if (draft.rolePreference?.length) {
    const next = mergeSkills(builder.rolePreference || [], draft.rolePreference);
    if (next.length > (builder.rolePreference?.length || 0)) {
      builder.rolePreference = next;
      updated.push('rolePreference');
    }
  }
  if (!isEmpty(draft.universityOrCompany) && (overwrite || isEmpty(builder.universityOrCompany))) {
    builder.universityOrCompany = String(draft.universityOrCompany).trim();
    updated.push('universityOrCompany');
  }
  if (draft.education?.length) {
    const nextEducation = mergeEducation(builder.education || [], draft.education);
    if (nextEducation.length > (builder.education?.length || 0)) {
      builder.education = nextEducation;
      updated.push('education');
    }
    const firstSchool = nextEducation.find((entry) => entry.school)?.school;
    if (firstSchool && (overwrite || isEmpty(builder.universityOrCompany))) {
      builder.universityOrCompany = firstSchool;
      updated.push('universityOrCompany');
    }
  }
  if (draft.experiences?.length) {
    const nextExperiences = mergeExperiences(builder.experiences || [], draft.experiences);
    if (JSON.stringify(nextExperiences) !== JSON.stringify(builder.experiences || [])) {
      builder.experiences = nextExperiences;
      updated.push('experiences');
    }
    const current = nextExperiences.find((entry) => entry.isCurrent) || nextExperiences[0];
    if (current?.company && isEmpty(builder.universityOrCompany)) {
      builder.universityOrCompany = current.company;
      updated.push('universityOrCompany');
    }
  }
  if (draft.graduationYear && !builder.graduationYear) {
    builder.graduationYear = draft.graduationYear;
    updated.push('graduationYear');
  }

  if (draft.links) {
    builder.links = builder.links || {};
    for (const key of ['github', 'linkedin', 'portfolio', 'personalWebsite', 'devpost'] as const) {
      const value = draft.links[key];
      if (!isEmpty(value) && isEmpty(builder.links[key])) {
        builder.links[key] = String(value).trim();
        updated.push(`links.${key}`);
      }
    }
  }

  return updated;
}

export async function upsertEnrichedProjects(
  builderId: any,
  projects: EnrichedProjectDraft[],
  options?: { overwriteImported?: boolean }
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  const overwriteImported = options?.overwriteImported ?? true;

  for (const draft of projects) {
    if (!draft.projectName || !draft.sourceId) continue;

    const existing = await ProjectRecord.findOne({ builderId, sourceId: draft.sourceId }).lean() as any;
    const isConfirmed = existing && CONFIRMED_STATUSES.has(String(existing.verificationStatus));

    if (isConfirmed && !overwriteImported) continue;

    const setFields: Record<string, unknown> = {
      projectName: draft.projectName,
      source: draft.source,
      sourceId: draft.sourceId,
      verificationStatus: draft.verificationStatus || 'imported_unverified',
      confidence: draft.confidence ?? 0.75,
    };

    const maybeSet = (field: string, value: unknown) => {
      if (value == null) return;
      if (typeof value === 'string' && value.trim().length === 0) return;
      if (Array.isArray(value) && value.length === 0) return;
      if (!existing || overwriteImported || isEmpty((existing as any)[field])) {
        setFields[field] = value;
      }
    };

    maybeSet('description', draft.description);
    maybeSet('problemSolved', draft.problemSolved);
    maybeSet('techStack', draft.techStack);
    maybeSet('builderContribution', draft.builderContribution);
    maybeSet('status', draft.status);

    if (draft.links) {
      for (const key of ['github', 'devpost', 'demo', 'videoDemo', 'pitchDeck', 'screenshots'] as const) {
        const value = draft.links[key];
        if (!isEmpty(value)) {
          if (!existing || overwriteImported || isEmpty((existing as any)?.links?.[key])) {
            setFields[`links.${key}`] = value;
          }
        }
      }
    }

    const result = await ProjectRecord.findOneAndUpdate(
      { builderId, sourceId: draft.sourceId },
      { $set: setFields, $setOnInsert: { builderId } },
      { upsert: true, new: true }
    );

    if (existing) updated += 1;
    else if (result) created += 1;
  }

  return { created, updated };
}

export async function refreshBuilderScores(
  builderId: any,
  options?: {
    skipQuality?: boolean;
    skipStatsRefresh?: boolean;
    skipEmbeddings?: boolean;
  }
) {
  const builder = await BuilderProfile.findById(builderId);
  if (!builder) return null;

  const projects = await ProjectRecord.find({ builderId: builder._id }).lean();
  builder.profileCompletion = computeBuilderScores(builder, projects);

  if (!options?.skipQuality) {
    try {
      const quality = await evaluateBuilderProfileQuality(builder, projects);
      builder.profileQuality = quality;
      builder.profileQuality.evaluatedAt = new Date();
    } catch (err) {
      console.warn('[builderEnrichment] quality eval failed', err instanceof Error ? err.message : err);
    }
  }

  await builder.save();

  if (!options?.skipStatsRefresh) {
    scheduleTalentStatsRefresh();
  }

  if (!options?.skipEmbeddings) {
    for (const project of projects) {
      await upsertProjectEmbedding({
        projectId: String(project._id),
        builderId: String(builder._id),
        project,
      });
    }
    await upsertBuilderEmbedding({
      builderId: String(builder._id),
      builder: builder.toObject ? builder.toObject() : builder,
      projects,
    });
  }

  await upsertTalentSearchIndexForBuilder(builder._id);

  return builder;
}
