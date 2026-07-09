import mongoose from 'mongoose';

export const SEARCHABLE_BUILDER_STATUSES = [
  'imported_unverified',
  'builder_confirmed',
  'peer_confirmed',
  'admin_verified',
  'founder_verified',
];

export const SEARCHABLE_VISIBILITY_STATUSES = ['public', 'matched_only', null];

export const BUILDER_SEARCH_SELECT = [
  'name',
  'headline',
  'bio',
  'skills',
  'rolePreference',
  'preferredWorkType',
  'links',
  'availability',
  'hiringIntent',
  'profileCompletion',
  'profileQuality',
  'verificationStatus',
  'visibilityStatus',
  'universityOrCompany',
  'education',
  'experiences',
  'enrichmentInsights',
  'updatedAt',
].join(' ');

export const PROJECT_SEARCH_SELECT =
  'builderId projectName description problemSolved techStack builderContribution contributionTags verificationStatus links';

export function searchableBuilderFilter(extra: Record<string, unknown> = {}) {
  return {
    verificationStatus: { $in: SEARCHABLE_BUILDER_STATUSES },
    visibilityStatus: { $in: SEARCHABLE_VISIBILITY_STATUSES },
    ...extra,
  };
}

export function builderIdFromEntry(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const value = (entry as { _id?: unknown; builderId?: unknown })._id
    ?? (entry as { builderId?: unknown }).builderId;
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

export function projectEvidenceSortScore(project: any) {
  let score = 0;
  if (['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified'].includes(project?.verificationStatus)) score += 4;
  if (project?.links?.github) score += 3;
  if (project?.links?.demo || project?.links?.devpost) score += 3;
  if (project?.builderContribution && String(project.builderContribution).length > 30) score += 2;
  if (Array.isArray(project?.techStack) && project.techStack.length > 0) score += 1;
  if (project?.description && String(project.description).length > 50) score += 1;
  return score;
}

export function profileLimitPoolTarget(profileLimit: number | null) {
  if (profileLimit === null) return 80;
  return Math.max(profileLimit * 4, 40);
}

export async function hydrateSearchableBuilderPool(params: {
  seedBuilders: any[];
  targetPoolSize: number;
  BuilderProfile: any;
  ProjectRecord: any;
  excludeBuilderIds?: Array<string | mongoose.Types.ObjectId>;
  select?: string;
}) {
  const {
    seedBuilders,
    targetPoolSize,
    BuilderProfile,
    ProjectRecord,
    excludeBuilderIds = [],
  } = params;
  const select = params.select || BUILDER_SEARCH_SELECT;
  const excluded = new Set(excludeBuilderIds.map((id) => String(id)));
  const seedIds = [...new Set(
    seedBuilders
      .map((entry) => builderIdFromEntry(entry))
      .filter((id): id is string => Boolean(id) && !excluded.has(id))
  )];

  let builders: any[] = seedIds.length
    ? await BuilderProfile.find(searchableBuilderFilter({
        _id: { $in: seedIds.map((id) => new mongoose.Types.ObjectId(id)) },
      }))
      .select(select)
      .lean()
    : [];

  const orderMap = new Map(seedIds.map((id, index) => [id, index]));
  builders.sort(
    (a, b) => (orderMap.get(String(a._id)) ?? 999) - (orderMap.get(String(b._id)) ?? 999)
  );

  const existingIds = builders.map((builder) => builder._id);
  if (builders.length < targetPoolSize) {
    const supplemental = await BuilderProfile.find(searchableBuilderFilter({
      _id: { $nin: [...existingIds, ...excludeBuilderIds] },
    }))
      .select(select)
      .sort({
        'profileCompletion.proofScore': -1,
        'profileQuality.overallScore': -1,
        updatedAt: -1,
      })
      .limit(targetPoolSize - builders.length)
      .lean();
    builders = [...builders, ...supplemental];
  }

  const builderIds = builders.map((builder) => builder._id);
  const allProjects = builderIds.length
    ? await ProjectRecord.find({ builderId: { $in: builderIds } })
      .select(PROJECT_SEARCH_SELECT)
      .limit(Math.min(800, builderIds.length * 6))
      .maxTimeMS(5000)
      .lean()
    : [];

  const projectsByBuilder = new Map<string, any[]>();
  for (const project of allProjects) {
    const key = String(project.builderId);
    if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
    projectsByBuilder.get(key)!.push(project);
  }
  for (const projects of projectsByBuilder.values()) {
    projects.sort((a, b) => projectEvidenceSortScore(b) - projectEvidenceSortScore(a));
  }

  return { builders, projectsByBuilder, allProjects };
}
