import mongoose from 'mongoose';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import TalentSearchIndex from '@/models/talent/TalentSearchIndex';
import TalentSearchKey from '@/models/talent/TalentSearchKey';

const SEARCHABLE_BUILDER_STATUSES = [
  'imported_unverified',
  'builder_confirmed',
  'peer_confirmed',
  'admin_verified',
  'founder_verified',
];

const SEARCHABLE_VISIBILITY_STATUSES = ['public', 'matched_only', null];

const BUILDER_INDEX_SELECT = [
  'name',
  'headline',
  'rolePreference',
  'preferredWorkType',
  'links',
  'availability',
  'hiringIntent',
  'profileCompletion',
  'profileQuality',
  'verificationStatus',
  'visibilityStatus',
  'updatedAt',
].join(' ');

const PROJECT_INDEX_SELECT = [
  'builderId',
  'projectName',
  'description',
  'problemSolved',
  'techStack',
  'builderContribution',
  'contributionTags',
  'verificationStatus',
  'links',
  'updatedAt',
].join(' ');

const QUERY_STOP_TERMS = new Set([
  'ai',
  'app',
  'build',
  'builder',
  'building',
  'development',
  'developer',
  'engineer',
  'founding',
  'platform',
  'product',
  'project',
  'proof',
  'saas',
  'ship',
  'shipped',
  'software',
  'startup',
  'tool',
  'web',
  'work',
]);

function normalizeTerm(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: unknown, max = 240) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
}

function unique(values: unknown[], max = 80) {
  return [...new Set(values.map(normalizeTerm).filter(Boolean))].slice(0, max);
}

function expandTerms(values: unknown[], max = 120) {
  const terms = new Set<string>();
  for (const value of values) {
    const normalized = normalizeTerm(value);
    if (!normalized) continue;
    terms.add(normalized);
    for (const part of normalized.split(' ')) {
      if (part.length >= 2) terms.add(part);
    }
  }
  return [...terms].slice(0, max);
}

function buildQueryTerms(values: unknown[]) {
  const exactTerms = [...new Set(
    values
      .map(normalizeTerm)
      .filter((term) => term.length >= 2 && term.length <= 48)
      .filter((term) => !QUERY_STOP_TERMS.has(term))
  )].slice(0, 40);
  if (exactTerms.length >= 3) return exactTerms;

  const expanded = expandTerms(values, 80);
  const selective = expanded.filter((term) => !QUERY_STOP_TERMS.has(term) && term.length >= 2);
  return (selective.length >= 3 ? selective : expanded).slice(0, 40);
}

function projectEvidenceScore(project: any) {
  let score = 0;
  if (['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified'].includes(project?.verificationStatus)) score += 4;
  if (project?.links?.github) score += 3;
  if (project?.links?.demo || project?.links?.devpost) score += 3;
  if (project?.builderContribution && String(project.builderContribution).length > 30) score += 2;
  if (Array.isArray(project?.techStack) && project.techStack.length > 0) score += 1;
  if (project?.description && String(project.description).length > 50) score += 1;
  return score;
}

function buildProjectSnapshot(project: any) {
  return {
    _id: project._id,
    builderId: project.builderId,
    projectName: compactText(project.projectName, 120),
    description: compactText(project.description, 320),
    problemSolved: compactText(project.problemSolved, 220),
    techStack: Array.isArray(project.techStack) ? project.techStack.slice(0, 16) : [],
    builderContribution: compactText(project.builderContribution, 320),
    contributionTags: Array.isArray(project.contributionTags) ? project.contributionTags.slice(0, 16) : [],
    verificationStatus: project.verificationStatus || null,
    links: {
      demo: project.links?.demo || null,
      github: project.links?.github || null,
      devpost: project.links?.devpost || null,
      pitchDeck: project.links?.pitchDeck || null,
      videoDemo: project.links?.videoDemo || null,
      screenshots: project.links?.screenshots || null,
    },
    evidenceScore: projectEvidenceScore(project),
  };
}

function buildBuilderSnapshot(doc: any) {
  return {
    _id: doc.builderId,
    name: doc.name,
    headline: doc.headline,
    rolePreference: doc.rolePreference || [],
    preferredWorkType: doc.preferredWorkType || [],
    links: doc.links || {},
    availability: doc.availability || {},
    hiringIntent: doc.hiringIntent || {},
    profileCompletion: doc.profileCompletion || {},
    profileQuality: doc.profileQuality || {},
    verificationStatus: doc.verificationStatus || null,
    visibilityStatus: doc.visibilityStatus || null,
  };
}

function relevanceScore(doc: any, terms: string[]) {
  const termSet = new Set(terms.map(normalizeTerm).filter(Boolean));
  const scoreArray = (values: string[] = [], weight: number) => {
    let score = 0;
    for (const value of values) {
      const normalized = normalizeTerm(value);
      if (termSet.has(normalized)) score += weight;
    }
    return score;
  };

  return (
    scoreArray(doc.normalizedSkills, 6) +
    scoreArray(doc.normalizedProjectTech, 5) +
    scoreArray(doc.normalizedContributionTags, 3) +
    scoreArray(doc.searchTerms, 2) +
    Math.min(12, doc.bestProjectEvidenceScore || 0) +
    Math.min(8, doc.projectCount || 0)
  );
}

function buildSearchKeyRows(payload: any) {
  const rows = new Map<string, { term: string; builderId: any; kind: string; weight: number; evidenceScore: number; indexedAt: Date }>();
  const add = (term: string, kind: 'skill' | 'project_tech' | 'contribution' | 'text', weight: number) => {
    const normalized = normalizeTerm(term);
    if (!normalized || normalized.length > 80) return;
    const existing = rows.get(normalized);
    if (!existing || existing.weight < weight) {
      rows.set(normalized, {
        term: normalized,
        builderId: payload.builderId,
        kind,
        weight,
        evidenceScore: payload.bestProjectEvidenceScore || 0,
        indexedAt: new Date(),
      });
    }
  };

  for (const term of payload.normalizedSkills || []) add(term, 'skill', 6);
  for (const term of payload.normalizedProjectTech || []) add(term, 'project_tech', 5);
  for (const term of payload.normalizedContributionTags || []) add(term, 'contribution', 3);
  for (const term of payload.searchTerms || []) add(term, 'text', 2);

  return [...rows.values()].slice(0, 180);
}

export function buildSearchableBuilderFilter(extra: Record<string, unknown> = {}) {
  return {
    verificationStatus: { $in: SEARCHABLE_BUILDER_STATUSES },
    visibilityStatus: { $in: SEARCHABLE_VISIBILITY_STATUSES },
    ...extra,
  };
}

export function buildTalentSearchIndexPayload(builder: any, projects: any[]) {
  const sortedProjects = [...projects]
    .map(buildProjectSnapshot)
    .sort((a, b) => b.evidenceScore - a.evidenceScore);
  const projectSnapshots = sortedProjects.slice(0, 8);
  const normalizedSkills = unique(builder.rolePreference || [], 40);
  const normalizedProjectTech = unique(projects.flatMap((project) => project.techStack || []), 60);
  const normalizedContributionTags = unique(projects.flatMap((project) => project.contributionTags || []), 60);
  const searchTerms = expandTerms([
    ...(builder.rolePreference || []),
    ...(builder.preferredWorkType || []),
    builder.headline,
    builder.profileQuality?.oneLineSummary,
    ...projects.flatMap((project) => [
      project.projectName,
      project.description,
      project.problemSolved,
      project.builderContribution,
      ...(project.techStack || []),
      ...(project.contributionTags || []),
    ]),
  ]);

  return {
    builderId: builder._id,
    name: builder.name || null,
    headline: builder.headline || null,
    rolePreference: builder.rolePreference || [],
    normalizedSkills,
    normalizedProjectTech,
    normalizedContributionTags,
    searchTerms,
    preferredWorkType: builder.preferredWorkType || [],
    links: builder.links || {},
    availability: {
      availableNow: Boolean(builder.availability?.availableNow),
      hoursPerWeek: builder.availability?.hoursPerWeek || null,
      remotePreference: builder.availability?.remotePreference || 'unspecified',
    },
    hiringIntent: builder.hiringIntent || {},
    profileCompletion: builder.profileCompletion || {},
    profileQuality: {
      overallScore: builder.profileQuality?.overallScore || 0,
      label: builder.profileQuality?.label || null,
      oneLineSummary: builder.profileQuality?.oneLineSummary || null,
      founderClarity: builder.profileQuality?.founderClarity || {},
    },
    verificationStatus: builder.verificationStatus || null,
    visibilityStatus: builder.visibilityStatus || null,
    projectCount: projects.length,
    strongProjectCount: sortedProjects.filter((project) => project.evidenceScore >= 6).length,
    bestProjectEvidenceScore: sortedProjects[0]?.evidenceScore || 0,
    projectSnapshots,
    sourceUpdatedAt: builder.updatedAt || null,
    indexedAt: new Date(),
  };
}

export async function upsertTalentSearchIndexForBuilder(builderId: unknown) {
  if (!mongoose.Types.ObjectId.isValid(String(builderId))) return null;
  const builder = await BuilderProfile.findById(builderId)
    .select(BUILDER_INDEX_SELECT)
    .lean();
  if (!builder) {
    await TalentSearchIndex.deleteOne({ builderId });
    return null;
  }

  const projects = await ProjectRecord.find({ builderId: builder._id })
    .select(PROJECT_INDEX_SELECT)
    .lean();
  const payload = buildTalentSearchIndexPayload(builder, projects);
  const result = await TalentSearchIndex.findOneAndUpdate(
    { builderId: builder._id },
    { $set: payload },
    { upsert: true, new: true }
  );
  await TalentSearchKey.deleteMany({ builderId: builder._id });
  const keyRows = buildSearchKeyRows(payload);
  if (keyRows.length) await TalentSearchKey.insertMany(keyRows, { ordered: false });
  return result;
}

export async function backfillTalentSearchIndex(params: { limit?: number; batchSize?: number } = {}) {
  const limit = params.limit && params.limit > 0 ? params.limit : 0;
  const batchSize = params.batchSize && params.batchSize > 0 ? params.batchSize : 100;
  let updated = 0;
  let processed = 0;
  let lastId: mongoose.Types.ObjectId | null = null;

  if (mongoose.connection.db) {
    await Promise.all([
      mongoose.connection.db.collection('talentsearchindexes').createIndex({ builderId: 1 }, { unique: true }),
      mongoose.connection.db.collection('talentsearchkeys').createIndex({ term: 1, weight: -1 }),
      mongoose.connection.db.collection('talentsearchkeys').createIndex({ builderId: 1, term: 1 }, { unique: true }),
    ]);
  }

  while (!limit || processed < limit) {
    const remaining = limit ? Math.min(batchSize, limit - processed) : batchSize;
    const filter = buildSearchableBuilderFilter(lastId ? { _id: { $gt: lastId } } : {});
    const batch = await BuilderProfile.find(filter)
      .select(BUILDER_INDEX_SELECT)
      .sort({ _id: 1 })
      .limit(remaining)
      .maxTimeMS(15000)
      .lean();
    if (!batch.length) break;
    const startedAt = Date.now();
    const builderIds = batch.map((builder) => builder._id);
    const projects = await ProjectRecord.find({ builderId: { $in: builderIds } })
      .select(PROJECT_INDEX_SELECT)
      .maxTimeMS(15000)
      .lean();
    const projectsByBuilder = new Map<string, any[]>();
    for (const project of projects) {
      const key = String(project.builderId);
      if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
      projectsByBuilder.get(key)!.push(project);
    }
    const payloads = batch.map((builder) => buildTalentSearchIndexPayload(builder, projectsByBuilder.get(String(builder._id)) || []));
    await TalentSearchIndex.bulkWrite(
      payloads.map((payload) => ({
        updateOne: {
          filter: { builderId: payload.builderId },
          update: { $set: payload },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    await TalentSearchKey.deleteMany({ builderId: { $in: builderIds } });
    const keyRows = payloads.flatMap(buildSearchKeyRows);
    if (keyRows.length) await TalentSearchKey.insertMany(keyRows, { ordered: false });
    updated += batch.length;
    processed += batch.length;
    lastId = batch[batch.length - 1]._id;
    console.info('[talent-search-index] backfill:batch', {
      processed,
      total: limit || 'all',
      batchSize: batch.length,
      projectCount: projects.length,
      durationMs: Date.now() - startedAt,
    });
  }

  return { processed, updated };
}

export async function searchTalentSearchIndex(params: {
  terms: string[];
  limit?: number;
}) {
  const startedAt = Date.now();
  const terms = buildQueryTerms(params.terms);
  const limit = params.limit || 350;
  if (!terms.length) {
    return { indexed: await TalentSearchIndex.estimatedDocumentCount(), builders: [] as any[], projectsByBuilder: new Map<string, any[]>(), durationMs: Date.now() - startedAt };
  }

  const collection = mongoose.connection.db?.collection('talentsearchindexes');
  const keyCollection = mongoose.connection.db?.collection('talentsearchkeys');
  if (!collection || !keyCollection) {
    return { indexed: 0, builders: [] as any[], projectsByBuilder: new Map<string, any[]>(), durationMs: Date.now() - startedAt };
  }

  const indexed = await collection.estimatedDocumentCount();
  if (!indexed) {
    return { indexed, builders: [] as any[], projectsByBuilder: new Map<string, any[]>(), durationMs: Date.now() - startedAt };
  }

  const keyRows = await keyCollection
    .find(
      { term: { $in: terms } },
      { projection: { builderId: 1, weight: 1, evidenceScore: 1 }, maxTimeMS: 3000 }
    )
    .limit(3000)
    .toArray();
  if (!keyRows.length) {
    return { indexed, builders: [] as any[], projectsByBuilder: new Map<string, any[]>(), durationMs: Date.now() - startedAt };
  }

  const candidateScores = new Map<string, { builderId: any; score: number }>();
  for (const row of keyRows) {
    const id = String(row.builderId);
    const existing = candidateScores.get(id) || { builderId: row.builderId, score: 0 };
    existing.score += Number(row.weight || 1) + Math.min(8, Number(row.evidenceScore || 0));
    candidateScores.set(id, existing);
  }
  const topBuilderIds = [...candidateScores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.builderId);

  const docs = await collection
    .find(
      {
        builderId: { $in: topBuilderIds },
        verificationStatus: { $in: SEARCHABLE_BUILDER_STATUSES },
        visibilityStatus: { $in: SEARCHABLE_VISIBILITY_STATUSES },
      },
      {
        projection: {
          builderId: 1,
          name: 1,
          headline: 1,
          rolePreference: 1,
          preferredWorkType: 1,
          links: 1,
          availability: 1,
          hiringIntent: 1,
          profileCompletion: 1,
          profileQuality: 1,
          verificationStatus: 1,
          visibilityStatus: 1,
          projectCount: 1,
          bestProjectEvidenceScore: 1,
          projectSnapshots: { $slice: 4 },
        },
        maxTimeMS: 3000,
      }
    )
    .toArray();

  const ranked = docs
    .map((doc: any) => ({
      doc,
      relevance: candidateScores.get(String(doc.builderId))?.score || relevanceScore(doc, terms),
    }))
    .filter((entry) => entry.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);

  const builders = ranked.map(({ doc }) => buildBuilderSnapshot(doc));
  const projectsByBuilder = new Map<string, any[]>();
  for (const { doc } of ranked) {
    projectsByBuilder.set(
      String(doc.builderId),
      (doc.projectSnapshots || []).map((project: any) => ({ ...project, builderId: doc.builderId }))
    );
  }

  return {
    indexed,
    builders,
    projectsByBuilder,
    durationMs: Date.now() - startedAt,
  };
}
