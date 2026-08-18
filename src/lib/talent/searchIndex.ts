import mongoose from 'mongoose';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
import TalentSearchIndex from '@/models/talent/TalentSearchIndex';
import TalentSearchKey from '@/models/talent/TalentSearchKey';
import {
  collectBuilderSearchProfile,
  expandSearchTerms,
  normalizeSearchTerm,
  uniqueSearchTerms,
} from '@/lib/talent/searchTokens';
import { builderLocationSearchTerms, collectBuilderLocationTexts } from '@/lib/talent/builderLocation';

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
  'location',
  'education',
  'experiences',
  'enrichmentInsights',
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

function compactText(value: unknown, max = 240) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
}

function buildQueryTerms(values: unknown[]) {
  const exactTerms = [...new Set(
    values
      .map(normalizeSearchTerm)
      .filter((term) => term.length >= 2 && term.length <= 48)
      .filter((term) => !QUERY_STOP_TERMS.has(term))
  )].slice(0, 40);

  const expanded = expandSearchTerms(values, 80);
  const selective = expanded.filter((term) => !QUERY_STOP_TERMS.has(term) && term.length >= 2);
  const tokenTerms = selective.length >= 3 ? selective : expanded;
  return [...new Set([...exactTerms, ...tokenTerms])].slice(0, 60);
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
    universityOrCompany: doc.universityOrCompany || null,
    education: doc.education || [],
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
  const termSet = new Set(terms.map(normalizeSearchTerm).filter(Boolean));
  const scoreArray = (values: string[] = [], weight: number) => {
    let score = 0;
    for (const value of values) {
      const normalized = normalizeSearchTerm(value);
      if (termSet.has(normalized)) score += weight;
    }
    return score;
  };

  return (
    scoreArray(doc.normalizedSkills, 6) +
    scoreArray(doc.normalizedExperienceCompanies, 8) +
    scoreArray(doc.normalizedExperienceTitles, 6) +
    scoreArray(doc.normalizedEducationSchools, 7) +
    scoreArray(doc.normalizedEnrichmentSignals, 5) +
    scoreArray(doc.normalizedHighlightTerms, 6) +
    scoreArray(doc.normalizedBioKeywords, 4) +
    scoreArray(doc.normalizedRoleDomains, 5) +
    scoreArray(doc.normalizedProjectTech, 5) +
    scoreArray(doc.normalizedContributionTags, 3) +
    scoreArray(doc.normalizedLocationTerms, 8) +
    scoreArray(doc.searchTerms, 2) +
    Math.min(12, doc.bestProjectEvidenceScore || 0) +
    Math.min(8, doc.projectCount || 0)
  );
}

function buildSearchKeyRows(payload: any) {
  const rows = new Map<string, { term: string; builderId: any; kind: string; weight: number; evidenceScore: number; indexedAt: Date }>();
  const add = (
    term: string,
    kind: 'skill' | 'project_tech' | 'contribution' | 'experience' | 'education' | 'enrichment' | 'highlight' | 'bio' | 'domain' | 'location' | 'text',
    weight: number
  ) => {
    const normalized = normalizeSearchTerm(term);
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
  for (const term of payload.normalizedExperienceCompanies || []) add(term, 'experience', 8);
  for (const term of payload.normalizedExperienceTitles || []) add(term, 'experience', 6);
  for (const term of payload.normalizedEducationSchools || []) add(term, 'education', 7);
  for (const term of payload.normalizedEnrichmentSignals || []) add(term, 'enrichment', 5);
  for (const term of payload.normalizedHighlightTerms || []) add(term, 'highlight', 6);
  for (const term of payload.normalizedBioKeywords || []) add(term, 'bio', 4);
  for (const term of payload.normalizedRoleDomains || []) add(term, 'domain', 5);
  for (const term of payload.normalizedProjectTech || []) add(term, 'project_tech', 5);
  for (const term of payload.normalizedContributionTags || []) add(term, 'contribution', 3);
  for (const term of payload.normalizedLocationTerms || []) add(term, 'location', 8);
  for (const term of payload.searchTerms || []) add(term, 'text', 2);

  return [...rows.values()].slice(0, 180);
}

async function replaceTalentSearchKeys(builderId: any, keyRows: ReturnType<typeof buildSearchKeyRows>) {
  const currentTerms = keyRows.map((row) => row.term);

  if (keyRows.length) {
    await upsertTalentSearchKeyRows(keyRows);
  }

  await TalentSearchKey.deleteMany({
    builderId,
    ...(currentTerms.length ? { term: { $nin: currentTerms } } : {}),
  });
}

async function upsertTalentSearchKeyRows(keyRows: ReturnType<typeof buildSearchKeyRows>) {
  try {
    await TalentSearchKey.bulkWrite(
      keyRows.map((row) => ({
        updateOne: {
          filter: { builderId: row.builderId, term: row.term },
          update: { $set: row },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error: any) {
    const duplicate =
      error?.code === 11000 ||
      error?.writeErrors?.some((writeError: any) => writeError?.code === 11000);
    if (!duplicate) throw error;

    await TalentSearchKey.bulkWrite(
      keyRows.map((row) => ({
        updateOne: {
          filter: { builderId: row.builderId, term: row.term },
          update: { $set: row },
          upsert: false,
        },
      })),
      { ordered: false }
    );
  }
}

export function buildSearchableBuilderFilter(extra: Record<string, unknown> = {}) {
  return {
    verificationStatus: { $in: SEARCHABLE_BUILDER_STATUSES },
    visibilityStatus: { $in: SEARCHABLE_VISIBILITY_STATUSES },
    ...extra,
  };
}

export function buildTalentSearchIndexPayload(builder: any, projects: any[], agentWrappedReport?: any) {
  const sortedProjects = [...projects]
    .map(buildProjectSnapshot)
    .sort((a, b) => b.evidenceScore - a.evidenceScore);
  const projectSnapshots = sortedProjects.slice(0, 8);
  const profile = collectBuilderSearchProfile(builder, projects);
  const normalizedSkills = profile.skills;
  const normalizedExperienceCompanies = profile.experienceCompanies;
  const normalizedExperienceTitles = profile.experienceTitles;
  const normalizedEducationSchools = profile.educationSchools;
  const normalizedEnrichmentSignals = profile.enrichmentTitles;
  const normalizedHighlightTerms = profile.highlightTerms;
  const normalizedBioKeywords = profile.bioKeywords;
  const normalizedRoleDomains = profile.roleDomains;
  const normalizedProjectTech = uniqueSearchTerms(projects.flatMap((project) => project.techStack || []), 60);
  const normalizedContributionTags = uniqueSearchTerms(projects.flatMap((project) => project.contributionTags || []), 60);
  const wrappedLanguages = (agentWrappedReport?.languages || []).map((item: any) => item?.name).filter(Boolean);
  const wrappedFrameworks = (agentWrappedReport?.frameworks || []).map((item: any) => item?.name).filter(Boolean);
  const wrappedAgents = agentWrappedReport?.sourceCoverage?.agents || [];
  const normalizedLocationTerms = builderLocationSearchTerms(builder);
  const locationTexts = collectBuilderLocationTexts(builder);
  const searchTerms = expandSearchTerms([
    ...profile.skills,
    ...profile.experienceCompanies,
    ...profile.experienceTitles,
    ...profile.educationSchools,
    ...profile.enrichmentTitles,
    ...profile.highlightTerms,
    ...profile.bioKeywords,
    ...profile.experiencePhrases,
    ...normalizedLocationTerms,
    ...locationTexts,
    builder.headline,
    builder.bio,
    builder.profileQuality?.oneLineSummary,
    agentWrappedReport?.archetype,
    agentWrappedReport?.founderRead?.summary,
    ...((agentWrappedReport?.buildprint?.earnedIdentities || []).map((item: any) => item.label) ||
      agentWrappedReport?.founderRead?.bestFitRoles ||
      []),
    agentWrappedReport?.buildprint?.evidenceStrength,
    ...wrappedLanguages,
    ...wrappedFrameworks,
    ...wrappedAgents,
    ...projects.flatMap((project) => [
      project.projectName,
      project.description,
      project.problemSolved,
      project.builderContribution,
      ...(project.techStack || []),
      ...(project.contributionTags || []),
    ]),
  ], 120);

  return {
    builderId: builder._id,
    name: builder.name || null,
    headline: builder.headline || null,
    rolePreference: builder.rolePreference || [],
    universityOrCompany: builder.universityOrCompany || null,
    education: (builder.education || []).slice(0, 6),
    normalizedSkills,
    normalizedExperienceCompanies,
    normalizedExperienceTitles,
    normalizedEducationSchools,
    normalizedEnrichmentSignals,
    normalizedHighlightTerms,
    normalizedBioKeywords,
    normalizedRoleDomains,
    normalizedProjectTech,
    normalizedContributionTags,
    normalizedLocationTerms,
    searchTerms,
    preferredWorkType: builder.preferredWorkType || [],
    links: builder.links || {},
    availability: {
      availableNow: Boolean(builder.availability?.availableNow),
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
    agentWrapped: agentWrappedReport
      ? {
          uploaded: agentWrappedReport.source === 'uploaded_agent_usage',
          archetype: agentWrappedReport.archetype || null,
          score: typeof agentWrappedReport.score === 'number' ? agentWrappedReport.score : null,
          agents: wrappedAgents.slice(0, 6),
          languages: wrappedLanguages.slice(0, 6),
          frameworks: wrappedFrameworks.slice(0, 8),
          sessionCount: agentWrappedReport.sourceCoverage?.sessionCount || 0,
        }
      : { uploaded: false },
    sourceUpdatedAt: builder.updatedAt || null,
    indexedAt: new Date(),
  };
}

export async function upsertTalentSearchIndexForBuilder(builderId: unknown) {
  if (!mongoose.Types.ObjectId.isValid(String(builderId))) return null;
  const builder = await BuilderProfile.findById(builderId)
    .select(BUILDER_INDEX_SELECT)
    .lean() as any;
  if (!builder) {
    await TalentSearchIndex.deleteOne({ builderId });
    return null;
  }

  const projects = await ProjectRecord.find({ builderId: builder._id })
    .select(PROJECT_INDEX_SELECT)
    .lean();
  const wrappedDoc = (await AgentWrappedReportModel.findOne({ builderId: builder._id, source: 'uploaded_agent_usage' })
    .sort({ createdAt: -1 })
    .select('report')
    .lean()) as { report?: any } | null;
  const payload = buildTalentSearchIndexPayload(builder, projects, wrappedDoc?.report || null);
  const result = await TalentSearchIndex.findOneAndUpdate(
    { builderId: builder._id },
    { $set: payload },
    { upsert: true, new: true }
  );
  await replaceTalentSearchKeys(builder._id, buildSearchKeyRows(payload));
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
      .lean() as any[];
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
    const keyRows = payloads.flatMap(buildSearchKeyRows);
    if (keyRows.length) {
      await upsertTalentSearchKeyRows(keyRows);
    }
    const termsByBuilder = new Map<string, string[]>();
    for (const row of keyRows) {
      const id = String(row.builderId);
      if (!termsByBuilder.has(id)) termsByBuilder.set(id, []);
      termsByBuilder.get(id)!.push(row.term);
    }
    await Promise.all(builderIds.map((builderId) => TalentSearchKey.deleteMany({
      builderId,
      term: { $nin: termsByBuilder.get(String(builderId)) || [] },
    })));
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

export async function backfillTalentSearchIndexWithRefresh(params: { limit?: number; batchSize?: number } = {}) {
  const result = await backfillTalentSearchIndex(params);
  const { scheduleTalentPoolSkillIndexRefresh } = await import('@/lib/talent/talentPoolSkillIndex');
  scheduleTalentPoolSkillIndexRefresh();
  return result;
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
  const rankedCandidates = [...candidateScores.values()].sort((a, b) => b.score - a.score);
  const candidateIdBatch = rankedCandidates
    .slice(0, Math.min(rankedCandidates.length, limit * 4))
    .map((entry) => entry.builderId);
  const liveProfiles = candidateIdBatch.length
    ? await BuilderProfile.find({
        _id: { $in: candidateIdBatch },
        verificationStatus: { $in: SEARCHABLE_BUILDER_STATUSES },
        visibilityStatus: { $in: SEARCHABLE_VISIBILITY_STATUSES },
      })
      .select('_id')
      .maxTimeMS(3000)
      .lean()
    : [];
  const liveIdSet = new Set(liveProfiles.map((profile: any) => String(profile._id)));
  const topBuilderIds = rankedCandidates
    .filter((entry) => liveIdSet.has(String(entry.builderId)))
    .slice(0, limit)
    .map((entry) => entry.builderId);
  if (!topBuilderIds.length) {
    return { indexed, builders: [] as any[], projectsByBuilder: new Map<string, any[]>(), durationMs: Date.now() - startedAt };
  }

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
          universityOrCompany: 1,
          education: 1,
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
