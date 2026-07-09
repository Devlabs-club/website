import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { computeBuilderScores } from '@/lib/talent/matching';
import { evaluateBuilderProfileQuality } from '@/lib/talent/profileQuality';
import { scheduleTalentStatsRefresh } from '@/lib/talent/talentDatabaseStats';
import { upsertBuilderEmbedding, upsertProjectEmbedding } from '@/lib/talent/embeddings/upsertTalentEmbedding';
import { upsertTalentSearchIndexForBuilder } from '@/lib/talent/searchIndex';
import { findUserByEmail, updateUserAccount } from '@/lib/adminMongo';
import {
  dedupeBuilderProfileCollections,
  mergeExperiences as mergeExperienceEntries,
  mergeStringList,
  normalizedProjectName,
} from '@/lib/talent/profileDedup';
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
  return mergeStringList(existing, incoming);
}

function normalizeEducationEntry(entry: any) {
  const school = typeof entry?.school === 'string' ? entry.school.trim() : '';
  const degree = typeof entry?.degree === 'string' ? entry.degree.trim() : '';
  const field = typeof entry?.field === 'string' ? entry.field.trim() : '';
  const dateRange = typeof entry?.dateRange === 'string' ? entry.dateRange.trim() : '';
  const startDateLabel = typeof entry?.startDateLabel === 'string' ? entry.startDateLabel.trim() : '';
  const endDateLabel = typeof entry?.endDateLabel === 'string' ? entry.endDateLabel.trim() : '';
  const schoolLogoUrl = typeof entry?.schoolLogoUrl === 'string' ? entry.schoolLogoUrl.trim() : '';
  const schoolLinkedInUrl = typeof entry?.schoolLinkedInUrl === 'string' ? entry.schoolLinkedInUrl.trim() : '';
  const sourceId = typeof entry?.sourceId === 'string' ? entry.sourceId.trim() : '';
  const graduationYear =
    typeof entry?.graduationYear === 'number'
      ? entry.graduationYear
      : Number(String(entry?.endYear || entry?.endDateLabel || entry?.dateRange || '').match(/\b(19|20)\d{2}\b/)?.[0] || NaN);
  if (!school && !degree && !field) return null;
  return {
    school: school || null,
    degree: degree || null,
    field: field || null,
    dateRange: dateRange || null,
    startDateLabel: startDateLabel || null,
    endDateLabel: endDateLabel || null,
    graduationYear: Number.isFinite(graduationYear) ? graduationYear : null,
    schoolLogoUrl: schoolLogoUrl || null,
    schoolLinkedInUrl: schoolLinkedInUrl || null,
    source: typeof entry?.source === 'string' && entry.source.trim() ? entry.source.trim() : 'linkedin',
    sourceId: sourceId || null,
    importedAt: entry?.importedAt || new Date(),
  };
}

function educationKey(entry: any) {
  return [entry?.sourceId || '', entry?.school, entry?.degree, entry?.field, entry?.dateRange || entry?.graduationYear]
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

function looksLikeEducationDateText(value: unknown) {
  return /\b(19[8-9][0-9]|20[0-4][0-9])\b/.test(String(value || ''));
}

function splitEducationDateRange(value: unknown) {
  const text = String(value || '').trim();
  const [start, end] = text.split(/\s+[–-]\s+/).map((part) => part?.trim()).filter(Boolean);
  return {
    dateRange: text || null,
    startDateLabel: start || null,
    endDateLabel: end || text || null,
    graduationYear: Number(String(end || text || '').match(/\b(19|20)\d{2}\b/)?.[0] || NaN),
  };
}

function educationEntriesFromLinkedIn(builder: any, proposed: any, extracted: any) {
  const fromProposed = Array.isArray(proposed.$push?.education?.$each) ? proposed.$push.education.$each : [];
  const fromExtracted = Array.isArray(extracted.educationEntries)
    ? extracted.educationEntries
    : Array.isArray(extracted.education)
      ? extracted.education
      : [];
  const entries = [...fromProposed, ...fromExtracted];
  const lines = Array.isArray(extracted.education) ? extracted.education.map(String) : [];
  const existingSchool = typeof builder?.universityOrCompany === 'string' ? builder.universityOrCompany.trim() : '';
  const firstDateIndex = lines.findIndex(looksLikeEducationDateText);
  const hasExistingSchool = existingSchool
    ? entries.some((entry) => String(entry?.school || '').trim().toLowerCase() === existingSchool.toLowerCase())
    : true;

  if (existingSchool && !hasExistingSchool && firstDateIndex > 0) {
    const degreeLine = lines
      .slice(0, firstDateIndex)
      .find((line) => /\b(b\.?s\.?|bachelor|master|phd|degree|computer science|engineering|business)\b/i.test(line));
    const date = splitEducationDateRange(lines[firstDateIndex]);
    entries.unshift({
      school: existingSchool,
      degree: degreeLine || null,
      field: null,
      dateRange: date.dateRange,
      startDateLabel: date.startDateLabel,
      endDateLabel: date.endDateLabel,
      graduationYear: Number.isFinite(date.graduationYear) ? date.graduationYear : null,
      schoolLogoUrl: null,
      schoolLinkedInUrl: null,
      source: 'linkedin',
      sourceId: `linkedin:education:${String(builder?.links?.linkedin || builder?.name || 'builder')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}:${existingSchool.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${String(date.dateRange || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      importedAt: new Date(),
    });
  }

  return entries.slice(0, 8);
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
  return mergeExperienceEntries(existing, incoming, 'linkedin');
}

async function syncBuilderUserAvatar(builder: any, avatarUrl: string) {
  try {
    let userId = builder.userId ? String(builder.userId) : null;
    if (!userId && builder.email) {
      const user = await findUserByEmail(String(builder.email));
      userId = user?._id ? String(user._id) : null;
    }
    if (userId) {
      await updateUserAccount(userId, { avatarUrl });
    }
  } catch (err) {
    console.warn('[builderEnrichment] user avatar sync failed', err instanceof Error ? err.message : err);
  }
}

export async function applyProfileDraft(
  builder: any,
  draft: EnrichedProfileDraft,
  options?: { overwriteBasics?: boolean; deferExperiences?: boolean; writeBasics?: boolean }
): Promise<string[]> {
  const updated: string[] = [];
  const overwrite = options?.overwriteBasics ?? false;
  const writeBasics = options?.writeBasics ?? true;

  if (writeBasics && !isEmpty(draft.headline) && (overwrite || isEmpty(builder.headline))) {
    builder.headline = String(draft.headline).trim().slice(0, 120);
    updated.push('headline');
  }
  if (writeBasics && !isEmpty(draft.bio) && (overwrite || isEmpty(builder.bio))) {
    builder.bio = String(draft.bio).trim().slice(0, 2000);
    updated.push('bio');
  }
  if (!isEmpty(draft.avatarUrl) && (overwrite || isEmpty(builder.avatarUrl))) {
    builder.avatarUrl = String(draft.avatarUrl).trim();
    updated.push('avatarUrl');
    await syncBuilderUserAvatar(builder, builder.avatarUrl);
  }
  if (!isEmpty(draft.location) && (overwrite || isEmpty(builder.location))) {
    builder.location = String(draft.location).trim().slice(0, 120);
    updated.push('location');
  }
  if (draft.rolePreference?.length) {
    const next = mergeSkills(builder.rolePreference || [], draft.rolePreference);
    if (next.length !== (builder.rolePreference || []).length || next.some((s, i) => s !== (builder.rolePreference || [])[i])) {
      builder.rolePreference = next;
      updated.push('rolePreference');
    }
  }
  if (draft.skills?.length) {
    const next = mergeSkills(builder.skills || [], draft.skills);
    if (next.length !== (builder.skills || []).length || next.some((s, i) => s !== (builder.skills || [])[i])) {
      builder.skills = next.slice(0, 32);
      updated.push('skills');
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
    const firstGraduationYear = nextEducation.find((entry) => entry.graduationYear)?.graduationYear;
    if (firstGraduationYear && !builder.graduationYear) {
      builder.graduationYear = firstGraduationYear;
      updated.push('graduationYear');
    }
    const firstSchool = nextEducation.find((entry) => entry.school)?.school;
    if (firstSchool && (overwrite || isEmpty(builder.universityOrCompany))) {
      builder.universityOrCompany = firstSchool;
      updated.push('universityOrCompany');
    }
  }
  if (draft.experiences?.length && !options?.deferExperiences) {
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
    for (const key of ['github', 'linkedin', 'portfolio', 'personalWebsite', 'devpost', 'twitter'] as const) {
      const value = draft.links[key];
      if (!isEmpty(value) && isEmpty(builder.links[key])) {
        builder.links[key] = String(value).trim();
        updated.push(`links.${key}`);
      }
    }
  }

  return updated;
}

function eachMongoValues(value: unknown): string[] {
  if (value && typeof value === 'object' && '$each' in (value as object) && Array.isArray((value as any).$each)) {
    return (value as any).$each.map(String);
  }
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [];
}

function setNestedField(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

export type LinkedInCdpApplyResult = {
  profileFieldsUpdated: string[];
  experiencesAdded: number;
  experiencesImproved: number;
  experienceHighlights: string[];
  skillsAdded: number;
  headline: string | null;
  mode: 'remote_chrome_cdp';
};

/** Apply Railway CDP LinkedIn artifact to a builder (same fields as onboarding linkedin-enrichment). */
export async function applyLinkedInCdpToBuilder(
  builder: any,
  artifact: any,
  linkedinUrl: string,
  options?: { deferExperiences?: boolean }
): Promise<LinkedInCdpApplyResult> {
  const extracted = artifact?.extracted || {};
  const proposed = artifact?.proposedMongoUpdate || {};
  const profileFieldsUpdated: string[] = [];
  const beforeExperienceCount = (builder.experiences || []).length;
  const beforeSkillCount = (builder.skills || []).length;

  const draft: EnrichedProfileDraft = {
    headline: typeof proposed.$set?.headline === 'string' ? proposed.$set.headline : extracted.headline || null,
    bio:
      typeof proposed.$set?.bio === 'string'
        ? proposed.$set.bio
        : typeof extracted.about === 'string'
          ? extracted.about
          : null,
    avatarUrl: extracted?.cdpExtraction?.photo?.imageUrl || null,
    location: typeof proposed.$set?.location === 'string' ? proposed.$set.location : extracted.location || null,
    graduationYear:
      typeof proposed.$set?.graduationYear === 'number'
        ? proposed.$set.graduationYear
        : typeof extracted.inferredGraduationYear === 'number'
          ? extracted.inferredGraduationYear
          : (Array.isArray(extracted.educationEntries) || Array.isArray(extracted.education))
            ? (Array.isArray(extracted.educationEntries) ? extracted.educationEntries : extracted.education)
                .map((entry: any) => Number(entry?.graduationYear || entry?.endYear || String(entry?.endDateLabel || entry?.dateRange || '').match(/\b(19|20)\d{2}\b/)?.[0]))
                .find((year: number) => Number.isFinite(year)) || null
            : null,
    universityOrCompany:
      typeof proposed.$set?.universityOrCompany === 'string' ? proposed.$set.universityOrCompany : null,
    skills: [
      ...eachMongoValues(proposed.$addToSet?.skills),
      ...(Array.isArray(extracted.skills) ? extracted.skills.map(String) : []),
    ],
    rolePreference: eachMongoValues(proposed.$addToSet?.rolePreference),
    experiences: Array.isArray(extracted.experiences) ? extracted.experiences : [],
    education: educationEntriesFromLinkedIn(builder, proposed, extracted),
    links: { linkedin: linkedinUrl },
  };

  profileFieldsUpdated.push(
    ...(await applyProfileDraft(builder, draft, {
      overwriteBasics: false,
      deferExperiences: options?.deferExperiences,
      writeBasics: false,
    }))
  );

  for (const [key, value] of Object.entries(proposed.$set || {})) {
    if (['headline', 'bio', 'location', 'graduationYear', 'universityOrCompany', 'updatedAt'].includes(key)) continue;
    if (key.startsWith('availability.') || key.startsWith('hiringIntent.')) {
      setNestedField(builder, key, value);
      const root = key.split('.')[0];
      if (!profileFieldsUpdated.includes(root)) profileFieldsUpdated.push(root);
    }
  }

  const preferredIncoming = eachMongoValues(proposed.$addToSet?.preferredWorkType);
  if (preferredIncoming.length) {
    const merged = mergeSkills(builder.preferredWorkType || [], preferredIncoming);
    if (merged.length > (builder.preferredWorkType || []).length) {
      builder.preferredWorkType = merged;
      profileFieldsUpdated.push('preferredWorkType');
    }
  }

  builder.links = { ...(builder.links || {}), linkedin: linkedinUrl };
  await builder.save();

  const afterExperiences = builder.experiences || [];
  const experiencesAdded = Math.max(0, afterExperiences.length - beforeExperienceCount);
  const experiencesImproved = 0;

  await aggregateInferredSkills(builder._id);
  const refreshed = await refreshBuilderScores(builder._id);
  const snapshotBuilder = refreshed || builder;
  const skillsAdded = Math.max(0, (snapshotBuilder.skills || []).length - beforeSkillCount);

  const experienceHighlights = (snapshotBuilder.experiences || [])
    .slice(0, 5)
    .map((entry: any) => {
      const title = entry?.title || 'Role';
      const company = entry?.company || 'Company';
      const dates = entry?.dateRange ? ` (${entry.dateRange})` : '';
      return `${title} at ${company}${dates}`;
    });

  return {
    profileFieldsUpdated: [...new Set(profileFieldsUpdated)],
    experiencesAdded,
    experiencesImproved,
    experienceHighlights,
    skillsAdded,
    headline: snapshotBuilder.headline || null,
    mode: 'remote_chrome_cdp',
  };
}

/** Union technical skills from profile, projects, and experience entries. */
export async function aggregateInferredSkills(builderId: any): Promise<string[]> {
  const builder = await BuilderProfile.findById(builderId);
  if (!builder) return [];

  const projects = await ProjectRecord.find({ builderId: builder._id }).select('techStack').lean();
  const fromProjects = projects.flatMap((p: any) => p.techStack || []);
  const fromExperiences = (builder.experiences || []).flatMap((e: any) => e.skills || []);
  const merged = mergeSkills(mergeSkills(builder.skills || [], fromProjects), fromExperiences);

  if (merged.length !== (builder.skills || []).length || merged.some((s, i) => s !== (builder.skills || [])[i])) {
    builder.skills = merged.slice(0, 32);
    await builder.save();
  }
  return builder.skills || [];
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

    const projectNameKey = normalizedProjectName(draft.projectName);
    const linkValues = Object.values(draft.links || {})
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().replace(/\/$/, ''));
    const linkQueries = linkValues.flatMap((value) => [
      { 'links.github': value },
      { 'links.devpost': value },
      { 'links.demo': value },
    ]);
    const existing = await ProjectRecord.findOne({
      builderId,
      $or: [
        { sourceId: draft.sourceId },
        { projectNameKey },
        ...linkQueries,
      ],
    }).lean() as any;
    const isConfirmed = existing && CONFIRMED_STATUSES.has(String(existing.verificationStatus));

    if (isConfirmed && !overwriteImported) continue;

    const setFields: Record<string, unknown> = {
      projectName: draft.projectName,
      projectNameKey,
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
      existing ? { _id: existing._id, builderId } : { builderId, sourceId: draft.sourceId },
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
  dedupeBuilderProfileCollections(builder);
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
