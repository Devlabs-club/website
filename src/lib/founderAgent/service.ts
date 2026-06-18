import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { runtimeEnvFromLocals, type RuntimeEnv } from '@/lib/workosEnv';
import { generateOpenRouterAgentTurn, getOpenRouterChatModel, hasOpenRouterConfig, type AgentMessage, type ToolDefinition } from '@/lib/openrouter';
import User from '@/models/user.tsx';
import CompanyProfile from '@/models/founder/CompanyProfile';
import JobPosting from '@/models/founder/JobPosting';
import FounderChatSession from '@/models/founder/FounderChatSession';
import FounderChatMessage from '@/models/founder/FounderChatMessage';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import MatchRecord from '@/models/talent/MatchRecord';
import Shortlist from '@/models/talent/Shortlist';
import IntroRequest from '@/models/talent/IntroRequest';
import CallSchedule from '@/models/talent/CallSchedule';
import CandidateFeedback from '@/models/talent/CandidateFeedback';
import { canRunPreviewAnyway } from '@/lib/talent/searchReadiness';
import { runFounderDiscoveryPipeline } from '@/lib/talent/discovery/index';
import { buildSearchStrategy } from '@/lib/talent/discovery/strategy';
import type { SearchMode } from '@/lib/talent/discovery/strategy';
import { persistDiscoveryCandidates } from '@/lib/talent/founderSearchPersist';
import { toPublicShortlist, buildTalentPreviewUiBlock } from '@/lib/talent/builderSearch';
import { buildFullCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import { buildFounderPipeline } from '@/lib/talent/founderPipeline';
import { countUnreadForFounder, getNotificationsForFounder } from '@/lib/talent/notifications';
import { shapeJobForTalentPool } from '@/lib/founderAgent/jobShaping';
import { retrieveSemanticBuilderCandidates, type SemanticScoreMap } from '@/lib/talent/embeddings/searchTalentEmbeddings';
import { searchTalentSearchIndex } from '@/lib/talent/searchIndex';

export type FounderIdentity = {
  founderId: string;
  email: string;
  founderName: string;
};

type ChatToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

type RetrievalMode = 'cached_shortlist' | 'search_index' | 'semantic' | 'keyword_fallback' | 'limited_broad_fallback';

function logFounderAgent(event: string, meta: Record<string, unknown> = {}) {
  console.info(`[founder-agent] ${event}`, meta);
}

function logFounderAgentError(event: string, error: unknown, meta: Record<string, unknown> = {}) {
  console.error(`[founder-agent] ${event}`, {
    ...meta,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

const SYSTEM_PROMPT = `You are the DevLabs founder hiring agent.

Style:
- Short, chill, Poke-like.
- No long replies. Usually 1-3 sentences.
- Say things like "Cool, I got it" only when useful.
- Ask one focused follow-up when a required detail is missing.

Rules:
- You have two jobs: conversation and tool use.
- Use chat history and company/job context before asking.
- One chat session maps to one role/job. Do not mix role context across sessions.
- Use create_job only when you have enough detail for: role/title, what the builder will do, skills, and company.
- If create_job says a follow-up was already asked, infer sensible fields from context and create the job.
- Use fetch_jobs when the founder asks what jobs/roles exist.
- Use fetch_job when the founder asks about one specific job.
- Use search_talent when the founder asks to find/search/match candidates for the current job.
- Use edit_job when they want to change a job. The tool reruns search when possible.
- Use update_company_info when they change company name, mission, product, website, industry, funding, or location.
- Do not mention tools unless the action matters to the founder.`;

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_job',
      description: 'Create a founder job posting only when enough role details are known.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          skillsNeeded: { type: 'array', items: { type: 'string' } },
          requirements: { type: 'array', items: { type: 'string' } },
          responsibilities: { type: 'array', items: { type: 'string' } },
          salary: { type: 'string' },
          jobType: { type: 'string' },
          workMode: { type: 'string' },
          location: { type: 'string' },
          companyName: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_jobs',
      description: 'Fetch all active or draft jobs for this founder.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_job',
      description: 'Fetch one full job posting by job ID.',
      parameters: {
        type: 'object',
        properties: { jobId: { type: 'string' } },
        required: ['jobId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_job',
      description: 'Edit a specific job posting. Reruns search when the edited job has enough search details.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          skillsNeeded: { type: 'array', items: { type: 'string' } },
          requirements: { type: 'array', items: { type: 'string' } },
          responsibilities: { type: 'array', items: { type: 'string' } },
          salary: { type: 'string' },
          jobType: { type: 'string' },
          workMode: { type: 'string' },
          location: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_talent',
      description: 'Run candidate/talent search for a job and persist the shortlist.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job ID. Omit to use the current role session job.' },
          searchMode: { type: 'string', enum: ['balanced', 'broad', 'strict'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_company_info',
      description: 'Create or update founder company profile fields.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          website: { type: 'string' },
          description: { type: 'string' },
          mission: { type: 'string' },
          productSummary: { type: 'string' },
          industry: { type: 'string' },
          fundingStage: { type: 'string' },
          location: { type: 'string' },
        },
      },
    },
  },
];

const SEARCHABLE_BUILDER_STATUSES = [
  'imported_unverified',
  'builder_confirmed',
  'peer_confirmed',
  'admin_verified',
  'founder_verified',
];

const SEARCHABLE_VISIBILITY_STATUSES = ['public', 'matched_only', null];

const BUILDER_SEARCH_SELECT = [
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

function buildSearchableBuilderFilter(extra: Record<string, unknown> = {}) {
  return {
    verificationStatus: { $in: SEARCHABLE_BUILDER_STATUSES },
    visibilityStatus: { $in: SEARCHABLE_VISIBILITY_STATUSES },
    ...extra,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSearchTerms(opportunity: any, strategy: ReturnType<typeof buildSearchStrategy>) {
  const values = [
    ...(Array.isArray(opportunity.matchingSkills) ? opportunity.matchingSkills : []),
    ...(Array.isArray(opportunity.skillsNeeded) ? opportunity.skillsNeeded : []),
    ...(Array.isArray(opportunity.niceToHaveSkills) ? opportunity.niceToHaveSkills : []),
    ...strategy.mustHaveSignals,
    ...strategy.niceToHaveSignals,
    ...strategy.semanticConcepts,
  ];

  return [...new Set(
    values
      .map((value) => String(value).trim())
      .filter((value) => value.length >= 2 && value.length <= 48)
      .map((value) => value.toLowerCase())
  )].slice(0, 14);
}

async function retrieveKeywordBuilderCandidates(opportunity: any, strategy: ReturnType<typeof buildSearchStrategy>) {
  const startedAt = Date.now();
  const terms = extractSearchTerms(opportunity, strategy);
  if (!terms.length) {
    return { builderIds: [] as string[], terms, profileHits: 0, projectHits: 0, durationMs: 0 };
  }

  const regexes = terms.map((term) => new RegExp(escapeRegex(term), 'i'));
  const [profileHits, projectHits] = await Promise.all([
    BuilderProfile.find(buildSearchableBuilderFilter({
      $or: [
        { rolePreference: { $in: regexes } },
        { 'experiences.skills': { $in: regexes } },
      ],
    }))
      .select('_id')
      .sort({ updatedAt: -1 })
      .limit(250)
      .maxTimeMS(5000)
      .lean(),
    ProjectRecord.find({
      $or: [
        { techStack: { $in: regexes } },
        { contributionTags: { $in: regexes } },
      ],
    })
      .select('builderId')
      .limit(500)
      .maxTimeMS(5000)
      .lean(),
  ]);

  const builderIds = new Set<string>();
  for (const builder of profileHits as any[]) {
    if (builder?._id) builderIds.add(String(builder._id));
  }
  for (const project of projectHits as any[]) {
    if (project?.builderId) builderIds.add(String(project.builderId));
  }

  return {
    builderIds: [...builderIds].slice(0, 350),
    terms,
    profileHits: profileHits.length,
    projectHits: projectHits.length,
    durationMs: Date.now() - startedAt,
  };
}

function projectEvidenceSortScore(project: any) {
  let score = 0;
  if (['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified'].includes(project?.verificationStatus)) score += 4;
  if (project?.links?.github) score += 3;
  if (project?.links?.demo || project?.links?.devpost) score += 3;
  if (project?.builderContribution && String(project.builderContribution).length > 30) score += 2;
  if (Array.isArray(project?.techStack) && project.techStack.length > 0) score += 1;
  if (project?.description && String(project.description).length > 50) score += 1;
  return score;
}

function okJson(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, ...(data as object) }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorJson(error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export { okJson, errorJson };

export async function resolveFounderIdentity(request: Request, locals?: App.Locals): Promise<FounderIdentity | { error: string; status: number }> {
  const runtime = runtimeEnvFromLocals(locals);
  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);
  if (!token) return { error: 'Please log in to continue.', status: 401 };

  const decoded = verifyToken(token, runtime as RuntimeEnv);
  if (!decoded?.email) return { error: 'Session expired. Please log in again.', status: 401 };

  await connectAdminDB();

  const email = decoded.email.toLowerCase().trim();
  let founderName = email.split('@')[0];
  let role = decoded.role;
  const user = await User.findById(decoded.userId).select('name role email').lean();
  if (user?.name) founderName = user.name;
  if (user?.role) role = String(user.role);

  if (role !== 'founder') {
    return { error: 'Founder account required.', status: 403 };
  }

  return {
    founderId: decoded.userId ? String(decoded.userId) : email,
    email,
    founderName,
  };
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function guessSkills(text: string): string[] {
  const skills = [
    'React',
    'TypeScript',
    'Node.js',
    'Python',
    'Go',
    'Next.js',
    'MongoDB',
    'Postgres',
    'OpenAI',
    'LangChain',
    'RAG',
    'Swift',
    'React Native',
    'AWS',
    'Docker',
  ];
  const lower = text.toLowerCase();
  return skills.filter((skill) => lower.includes(skill.toLowerCase())).slice(0, 8);
}

function inferTitle(text: string) {
  const match = text.match(/\b(?:hire|need|looking for|find)\s+(?:a|an)?\s*([^.,\n]{3,60})/i);
  return match?.[1]?.replace(/\b(builder|developer|engineer)\b.*$/i, (m) => m).trim() || 'Builder role';
}

function serializeJob(job: any) {
  if (!job) return null;
  const raw = typeof job.toObject === 'function' ? job.toObject() : job;
  return {
    ...raw,
    _id: String(raw._id),
    id: String(raw._id),
    title: raw.title || raw.roleTitle,
    roleTitle: raw.roleTitle || raw.title,
    description: raw.description || raw.builderWillDo || raw.startupSummary || '',
    salary: raw.salary || raw.budget || null,
    jobType: raw.jobType || raw.workType || raw.roleType?.[0] || null,
    workMode: raw.workMode || raw.locationPreference || null,
    location: raw.location || raw.locationPreference || null,
  };
}

function serializeCompany(company: any) {
  if (!company) return null;
  const raw = typeof company.toObject === 'function' ? company.toObject() : company;
  return { ...raw, _id: String(raw._id), id: String(raw._id) };
}

function serializeSession(session: any) {
  if (!session) return null;
  const raw = typeof session.toObject === 'function' ? session.toObject() : session;
  return {
    ...raw,
    _id: String(raw._id),
    id: String(raw._id),
    jobId: raw.jobId ? String(raw.jobId) : null,
  };
}

function serializeMessage(message: any) {
  const raw = typeof message.toObject === 'function' ? message.toObject() : message;
  return {
    id: String(raw._id),
    role: raw.role,
    content: raw.content,
    toolName: raw.toolName || null,
    createdAt: raw.createdAt,
  };
}

async function getCompany(identity: FounderIdentity) {
  return CompanyProfile.findOne({
    $or: [{ founderId: identity.founderId }, { founderEmail: identity.email }],
  }).sort({ updatedAt: -1 });
}

async function getOrCreateSession(identity: FounderIdentity, params: { sessionId?: string | null; jobId?: string | null; title?: string | null }) {
  const sessionId = params.sessionId && mongoose.Types.ObjectId.isValid(params.sessionId) ? params.sessionId : null;
  if (sessionId) {
    const existing = await FounderChatSession.findOne({ _id: sessionId, founderId: identity.founderId });
    if (existing) return existing;
  }

  const jobId = params.jobId && mongoose.Types.ObjectId.isValid(params.jobId) ? params.jobId : null;
  if (jobId) {
    const job = await JobPosting.findOne({ _id: jobId, founderEmail: identity.email });
    if (!job) throw new Error('Job not found.');
    return FounderChatSession.findOneAndUpdate(
      { founderId: identity.founderId, jobId: job._id },
      {
        $setOnInsert: {
          founderId: identity.founderId,
          founderEmail: identity.email,
          jobId: job._id,
          title: job.title || job.roleTitle || 'Hiring chat',
          status: 'active',
        },
        $set: { lastMessageAt: new Date() },
      },
      { upsert: true, new: true }
    );
  }

  return FounderChatSession.create({
    founderId: identity.founderId,
    founderEmail: identity.email,
    title: params.title || 'New hire',
    status: 'active',
    lastMessageAt: new Date(),
  });
}

async function appendMessage(params: {
  identity: FounderIdentity;
  session: any;
  role: 'founder' | 'assistant' | 'tool';
  content: string;
  toolName?: string | null;
  toolResult?: unknown;
  jobId?: unknown;
}) {
  const message = await FounderChatMessage.create({
    sessionId: params.session._id,
    jobId: params.jobId || params.session.jobId || null,
    founderId: params.identity.founderId,
    founderEmail: params.identity.email,
    role: params.role,
    content: params.content,
    toolName: params.toolName || null,
    toolResult: params.toolResult || null,
  });
  params.session.lastMessageAt = new Date();
  await params.session.save();
  return message;
}

async function runSearchForJob(identity: FounderIdentity, job: any, searchMode: SearchMode = 'balanced') {
  const startedAt = Date.now();
  const oppPlain = typeof job.toObject === 'function' ? job.toObject() : job;
  const jobId = String(oppPlain._id || job._id || '');
  logFounderAgent('search_talent:start', {
    founderId: identity.founderId,
    founderEmail: identity.email,
    jobId,
    title: oppPlain.title || oppPlain.roleTitle,
    searchMode,
  });
  if (!Array.isArray(oppPlain.matchingSkills) || oppPlain.matchingSkills.length === 0) {
    logFounderAgent('search_talent:shape_job:start', { jobId });
    const shaped = await shapeJobForTalentPool({
      title: oppPlain.title || oppPlain.roleTitle,
      description: oppPlain.description,
      builderWillDo: oppPlain.builderWillDo,
      skillsNeeded: oppPlain.skillsNeeded,
      niceToHaveSkills: oppPlain.niceToHaveSkills,
      requirements: oppPlain.requirements,
      responsibilities: oppPlain.responsibilities || oppPlain.deliverables,
      companyContext: [oppPlain.company, oppPlain.startupSummary, oppPlain.industry].filter(Boolean).join(' '),
    });
    Object.assign(job, {
      originalSkillsNeeded: shaped.originalSkillsNeeded,
      skillsNeeded: shaped.skillsNeeded,
      niceToHaveSkills: shaped.niceToHaveSkills,
      matchingSkills: shaped.matchingSkills,
      poolFitMetadata: shaped.poolFitMetadata,
    });
    await job.save();
    Object.assign(oppPlain, {
      originalSkillsNeeded: shaped.originalSkillsNeeded,
      skillsNeeded: shaped.matchingSkills.length ? shaped.matchingSkills : shaped.skillsNeeded,
      niceToHaveSkills: shaped.niceToHaveSkills,
      matchingSkills: shaped.matchingSkills,
      poolFitMetadata: shaped.poolFitMetadata,
    });
    logFounderAgent('search_talent:shape_job:done', {
      jobId,
      skillsNeeded: shaped.skillsNeeded,
      matchingSkills: shaped.matchingSkills,
      poolCoverage: shaped.poolFitMetadata?.coverage,
    });
  } else {
    oppPlain.skillsNeeded = oppPlain.matchingSkills;
  }
  if (!canRunPreviewAnyway(oppPlain)) {
    logFounderAgent('search_talent:skipped_not_ready', {
      jobId,
      hasTitle: Boolean(oppPlain.roleTitle || oppPlain.title),
      hasDescription: Boolean(oppPlain.builderWillDo || oppPlain.description || oppPlain.startupSummary),
      skillsCount: Array.isArray(oppPlain.skillsNeeded) ? oppPlain.skillsNeeded.length : 0,
    });
    return { skipped: true, reason: 'Job needs title, first deliverable, and required skills before search.' };
  }

  const lastSearchAt = job.lastSearchAt ? new Date(job.lastSearchAt) : null;
  const updatedAt = job.updatedAt ? new Date(job.updatedAt) : null;
  if (lastSearchAt && updatedAt && updatedAt.getTime() <= lastSearchAt.getTime() + 5000) {
    const cachedShortlist = await Shortlist.findOne({ opportunityId: String(job._id) }).lean();
    if (cachedShortlist) {
      const publicShortlist = toPublicShortlist(cachedShortlist);
      const totalFound = Array.isArray((cachedShortlist as any).candidates) ? (cachedShortlist as any).candidates.length : 0;
      const strongCount = Number((cachedShortlist as any).strongMatchCount || 0);
      logFounderAgent('search_talent:cache_hit', {
        jobId,
        totalFound,
        strongCount,
        durationMs: Date.now() - startedAt,
      });
      return {
        skipped: false,
        cached: true,
        totalFound,
        strongCount,
        retrievalMode: 'cached_shortlist' as RetrievalMode,
        scannedBuilders: 0,
        shortlist: publicShortlist,
        uiBlock: buildTalentPreviewUiBlock(cachedShortlist, oppPlain),
      };
    }
  }

  const strategy = buildSearchStrategy({ opportunity: oppPlain, founderId: identity.founderId, searchMode });
  let semanticScores: SemanticScoreMap = new Map();
  let retrievalMode: RetrievalMode = 'limited_broad_fallback';
  let builders: any[] = [];
  let projectsByBuilder = new Map<string, any[]>();
  let allProjects: any[] = [];

  const indexTerms = [
    strategy.primaryQuery,
    ...strategy.expandedQueries,
    ...extractSearchTerms(oppPlain, strategy),
  ];
  logFounderAgent('search_talent:index_retrieval:start', {
    jobId,
    terms: indexTerms.slice(0, 12),
  });
  try {
    const indexResult = await searchTalentSearchIndex({
      terms: indexTerms,
      limit: searchMode === 'broad' ? 160 : 80,
    });
    if (indexResult.builders.length > 0) {
      builders = indexResult.builders;
      projectsByBuilder = indexResult.projectsByBuilder;
      allProjects = [...projectsByBuilder.values()].flat();
      retrievalMode = 'search_index';
    }
    logFounderAgent('search_talent:index_retrieval:done', {
      jobId,
      retrievalMode,
      indexed: indexResult.indexed,
      candidateCount: indexResult.builders.length,
      projectSnapshotCount: allProjects.length,
      durationMs: indexResult.durationMs,
    });
  } catch (error) {
    logFounderAgentError('search_talent:index_retrieval:error', error, { jobId });
  }

  if (!builders.length) {
    const retrievalStartedAt = Date.now();
    let retrievedBuilderIds: string[] = [];
    logFounderAgent('search_talent:semantic_retrieval:start', {
      jobId,
      primaryQuery: strategy.primaryQuery,
      expandedQueries: strategy.expandedQueries.slice(0, 2),
    });
    try {
      const semantic = await Promise.race([
        retrieveSemanticBuilderCandidates({
          queries: [strategy.primaryQuery, ...strategy.expandedQueries.slice(0, 2)],
          candidateLimit: 240,
          profileLimit: 120,
          projectLimit: 220,
          minSimilarity: 0.22,
        }),
        new Promise<Awaited<ReturnType<typeof retrieveSemanticBuilderCandidates>>>((resolve) =>
          setTimeout(
            () => resolve({
              builderIds: [],
              scores: new Map(),
              profileHits: 0,
              projectHits: 0,
              profileHitCount: 0,
              projectHitCount: 0,
              usedQuery: strategy.primaryQuery,
            }),
            2000
          )
        ),
      ]);
      semanticScores = semantic.scores;
      retrievedBuilderIds = semantic.builderIds;
      if (retrievedBuilderIds.length > 0) retrievalMode = 'semantic';
      logFounderAgent('search_talent:semantic_retrieval:done', {
        jobId,
        retrievalMode,
        candidateIds: retrievedBuilderIds.length,
        profileHitCount: semantic.profileHitCount,
        projectHitCount: semantic.projectHitCount,
        durationMs: Date.now() - retrievalStartedAt,
      });
    } catch (error) {
      logFounderAgentError('search_talent:semantic_retrieval:error', error, { jobId });
    }

    if (!retrievedBuilderIds.length) {
      logFounderAgent('search_talent:keyword_retrieval:start', {
        jobId,
        terms: extractSearchTerms(oppPlain, strategy),
      });
      try {
        const keyword = await Promise.race([
          retrieveKeywordBuilderCandidates(oppPlain, strategy),
          new Promise<Awaited<ReturnType<typeof retrieveKeywordBuilderCandidates>>>((resolve) =>
            setTimeout(
              () => resolve({
                builderIds: [],
                terms: extractSearchTerms(oppPlain, strategy),
                profileHits: 0,
                projectHits: 0,
                durationMs: 5000,
              }),
              5000
            )
          ),
        ]);
        if (keyword.builderIds.length) {
          retrievedBuilderIds = keyword.builderIds;
          retrievalMode = 'keyword_fallback';
        }
        logFounderAgent('search_talent:keyword_retrieval:done', {
          jobId,
          retrievalMode,
          candidateIds: keyword.builderIds.length,
          profileHits: keyword.profileHits,
          projectHits: keyword.projectHits,
          terms: keyword.terms,
          durationMs: keyword.durationMs,
        });
      } catch (error) {
        logFounderAgentError('search_talent:keyword_retrieval:error', error, { jobId });
      }
    }

    const builderLoadStartedAt = Date.now();
    const retrievedObjectIds = retrievedBuilderIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const builderFilter = buildSearchableBuilderFilter(
      retrievedObjectIds.length > 0
        ? { _id: { $in: retrievedObjectIds } }
        : {}
    );
    const builderLimit = retrievedObjectIds.length > 0 ? retrievedObjectIds.length : 350;
    logFounderAgent('search_talent:load_builders:start', {
      jobId,
      retrievalMode,
      retrievedCandidateCount: retrievedObjectIds.length,
      broadFallbackLimit: retrievedObjectIds.length > 0 ? null : builderLimit,
    });
    const builderQuery = BuilderProfile.find(builderFilter)
      .select(BUILDER_SEARCH_SELECT)
      .limit(builderLimit)
      .maxTimeMS(10000)
      .lean();
    if (!retrievedObjectIds.length) {
      builderQuery.sort({ updatedAt: -1 });
    }
    builders = await builderQuery;
    logFounderAgent('search_talent:load_builders:done', {
      jobId,
      retrievalMode,
      builderCount: builders.length,
      priorBroadPoolEstimate: retrievedObjectIds.length > 0 ? 'skipped' : builders.length,
      durationMs: Date.now() - builderLoadStartedAt,
    });
    const builderIds = builders.map((b: any) => b._id);
    const projectLoadStartedAt = Date.now();
    logFounderAgent('search_talent:load_projects:start', { jobId, builderCount: builders.length });
    allProjects = builderIds.length
      ? await ProjectRecord.find({ builderId: { $in: builderIds } })
          .select('builderId projectName description problemSolved techStack builderContribution contributionTags verificationStatus links')
          .limit(1200)
          .maxTimeMS(10000)
          .lean()
      : [];
    logFounderAgent('search_talent:load_projects:done', {
      jobId,
      projectCount: allProjects.length,
      durationMs: Date.now() - projectLoadStartedAt,
    });

    projectsByBuilder = new Map<string, any[]>();
    for (const project of allProjects) {
      const key = String(project.builderId);
      if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
      projectsByBuilder.get(key)!.push(project);
    }
    for (const projects of projectsByBuilder.values()) {
      projects.sort((a, b) => projectEvidenceSortScore(b) - projectEvidenceSortScore(a));
    }
  }

  const feedbackDocs = await CandidateFeedback.find({
    founderId: identity.founderId,
    opportunityId: String(job._id),
    shouldAffectRanking: true,
  }).sort({ createdAt: -1 }).limit(30).lean();
  logFounderAgent('search_talent:discovery:start', {
    jobId,
    builderCount: builders.length,
    projectCount: allProjects.length,
    feedbackCount: feedbackDocs.length,
  });

  const result = await runFounderDiscoveryPipeline({
    opportunity: oppPlain,
    founderId: identity.founderId,
    builders,
    projectsByBuilder,
    searchMode,
    feedbackHistory: feedbackDocs.map((f: any) => ({
      founderId: f.founderId,
      opportunityId: f.opportunityId,
      builderId: f.builderId,
      action: f.action,
      reasonCategory: f.reasonCategory,
      notes: f.reasonText,
      shouldAffectRanking: f.shouldAffectRanking,
      createdAt: f.createdAt,
    })),
    enableLlmRerank: false,
    semanticScores,
    limit: 12,
  });
  logFounderAgent('search_talent:discovery:done', {
    jobId,
    retrievalMode,
    candidateCount: result.candidates.length,
    strongCount: result.searchQuality.strongCandidates,
    totalScanned: result.totalScanned,
    topCandidates: result.candidates.slice(0, 5).map((candidate) => ({
      builderId: candidate.builderId,
      name: candidate.builder?.name,
      matchScore: Math.round(candidate.overallFit * 100),
      matchLabel: candidate.matchLabel,
      semanticProfile: Number(candidate.components.semanticRoleFit.toFixed(3)),
      semanticProject: Number(candidate.components.semanticProjectFit.toFixed(3)),
      skillFit: Number(candidate.components.deterministicSkillFit.toFixed(3)),
      proofStrength: Number(candidate.components.proofStrength.toFixed(3)),
      sources: candidate.retrievalSources,
    })),
  });

  logFounderAgent('search_talent:persist:start', { jobId, candidateCount: result.candidates.length });
  const { shortlistDoc } = await persistDiscoveryCandidates({
    result,
    opportunityId: String(job._id),
    founderEmail: identity.email,
  });

  job.status = 'shortlisted';
  job.lastSearchAt = new Date();
  await job.save();

  const publicShortlist = toPublicShortlist(shortlistDoc);
  logFounderAgent('search_talent:done', {
    jobId,
    totalFound: result.candidates.length,
    strongCount: result.searchQuality.strongCandidates,
    durationMs: Date.now() - startedAt,
  });
  return {
    skipped: false,
    totalFound: result.candidates.length,
    strongCount: result.searchQuality.strongCandidates,
    retrievalMode,
    scannedBuilders: result.totalScanned,
    shortlist: publicShortlist,
    uiBlock: buildTalentPreviewUiBlock(shortlistDoc, oppPlain),
  };
}

async function toolCreateJob(identity: FounderIdentity, session: any, args: Record<string, unknown>, userText: string, company: any) {
  const title = cleanString(args.title) || cleanString(args.roleTitle);
  const description = cleanString(args.description) || cleanString(args.builderWillDo);
  const skills = cleanList(args.skillsNeeded);
  const companyName = cleanString(args.companyName) || company?.name || cleanString(args.company);
  const missing = [
    title ? null : 'role/title',
    description ? null : 'what the builder will ship',
    skills.length ? null : 'skills',
    companyName ? null : 'company',
  ].filter(Boolean) as string[];

  const metadata = session.metadata || {};
  if (missing.length && !metadata.createJobFollowupAsked) {
    session.metadata = { ...metadata, createJobFollowupAsked: true };
    await session.save();
    return {
      needsFollowup: true,
      message: `Need one thing: ${missing[0]}. What should I use?`,
      missing,
    };
  }

  const inferredSkills = skills.length ? skills : guessSkills(userText);
  const finalTitle = title || inferTitle(userText);
  const finalDescription = description || userText || `Build and ship the first version of ${finalTitle}.`;
  const finalCompany = companyName || 'Your startup';
  const shaped = await shapeJobForTalentPool({
    title: finalTitle,
    description: finalDescription,
    builderWillDo: finalDescription,
    skillsNeeded: inferredSkills.length ? inferredSkills : ['Builder mindset'],
    requirements: cleanList(args.requirements),
    responsibilities: cleanList(args.responsibilities),
    companyContext: [finalCompany, company?.productSummary, company?.description, company?.industry].filter(Boolean).join(' '),
  });

  const job = await JobPosting.create({
    founderId: identity.founderId,
    founderEmail: identity.email,
    founderName: identity.founderName,
    companyId: company?._id || null,
    title: finalTitle,
    roleTitle: finalTitle,
    description: finalDescription,
    builderWillDo: finalDescription,
    company: finalCompany,
    startupSummary: company?.productSummary || company?.description || null,
    industry: company?.industry || null,
    fundingStage: company?.fundingStage || null,
    originalSkillsNeeded: shaped.originalSkillsNeeded,
    skillsNeeded: shaped.skillsNeeded,
    matchingSkills: shaped.matchingSkills,
    requirements: cleanList(args.requirements),
    responsibilities: cleanList(args.responsibilities),
    salary: cleanString(args.salary),
    budget: cleanString(args.salary),
    jobType: cleanString(args.jobType),
    workType: cleanString(args.jobType),
    roleType: cleanString(args.jobType) ? [cleanString(args.jobType)] : [],
    workMode: cleanString(args.workMode),
    location: cleanString(args.location),
    locationPreference: cleanString(args.workMode) || cleanString(args.location),
    niceToHaveSkills: shaped.niceToHaveSkills,
    poolFitMetadata: shaped.poolFitMetadata,
    status: 'draft',
  });

  session.jobId = job._id;
  session.title = finalTitle;
  session.metadata = { ...metadata, createJobFollowupAsked: false };
  await session.save();

  return { job: serializeJob(job), message: `Cool, I created the ${finalTitle} job.` };
}

async function toolFetchJobs(identity: FounderIdentity) {
  const jobs = await JobPosting.find({
    founderEmail: identity.email,
    status: { $nin: ['closed'] },
  }).sort({ updatedAt: -1 }).limit(50).lean();
  return { jobs: jobs.map(serializeJob), count: jobs.length };
}

async function toolFetchJob(identity: FounderIdentity, args: Record<string, unknown>, session: any) {
  const jobId = cleanString(args.jobId) || cleanString(args.opportunityId) || (session?.jobId ? String(session.jobId) : null);
  if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) return { error: 'jobId is required.' };
  const job = await JobPosting.findOne({ _id: jobId, founderEmail: identity.email }).lean();
  if (!job) return { error: 'Job not found.' };
  return { job: serializeJob(job) };
}

async function toolEditJob(identity: FounderIdentity, args: Record<string, unknown>, session: any) {
  const nestedFields = args.fields && typeof args.fields === 'object' ? args.fields as Record<string, unknown> : {};
  const mergedArgs = { ...nestedFields, ...args };
  const jobId = cleanString(mergedArgs.jobId) || cleanString(mergedArgs.opportunityId) || (session?.jobId ? String(session.jobId) : null);
  if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) return { error: 'jobId is required.' };

  const job = await JobPosting.findOne({ _id: jobId, founderEmail: identity.email });
  if (!job) return { error: 'Job not found.' };

  const fields: Record<string, unknown> = {};
  const title = cleanString(mergedArgs.title) || cleanString(mergedArgs.roleTitle);
  if (title) {
    fields.title = title;
    fields.roleTitle = title;
  }
  const description = cleanString(mergedArgs.description) || cleanString(mergedArgs.builderWillDo);
  if (description) {
    fields.description = description;
    fields.builderWillDo = description;
  }
  const skills = cleanList(mergedArgs.skillsNeeded);
  if (skills.length) fields.skillsNeeded = skills;
  const requirements = cleanList(mergedArgs.requirements);
  if (requirements.length) fields.requirements = requirements;
  const responsibilities = cleanList(mergedArgs.responsibilities);
  if (responsibilities.length) {
    fields.responsibilities = responsibilities;
    fields.deliverables = responsibilities;
  }
  const deliverables = cleanList(mergedArgs.deliverables);
  if (deliverables.length) fields.deliverables = deliverables;
  const salary = cleanString(mergedArgs.salary) || cleanString(mergedArgs.budget);
  if (salary) {
    fields.salary = salary;
    fields.budget = salary;
  }
  const jobType = cleanString(mergedArgs.jobType) || cleanString(mergedArgs.workType) || cleanString(mergedArgs.hireType);
  if (jobType) {
    fields.jobType = jobType;
    fields.workType = jobType;
    fields.roleType = [jobType];
  }
  const workMode = cleanString(mergedArgs.workMode);
  if (workMode) {
    fields.workMode = workMode;
    fields.locationPreference = workMode;
  }
  const location = cleanString(mergedArgs.location) || cleanString(mergedArgs.locationPreference);
  if (location) {
    fields.location = location;
    fields.locationPreference = location;
  }
  const company = cleanString(mergedArgs.company);
  if (company) fields.company = company;
  const startupSummary = cleanString(mergedArgs.startupSummary);
  if (startupSummary) fields.startupSummary = startupSummary;
  const niceToHaveSkills = cleanList(mergedArgs.niceToHaveSkills);
  if (niceToHaveSkills.length) fields.niceToHaveSkills = niceToHaveSkills;
  const timeline = cleanString(mergedArgs.timeline);
  if (timeline) fields.timeline = timeline;
  const seniority = cleanString(mergedArgs.seniority);
  if (seniority) fields.seniority = seniority;
  const hoursPerWeek = cleanString(mergedArgs.hoursPerWeek);
  if (hoursPerWeek) fields.hoursPerWeek = hoursPerWeek;
  const status = cleanString(mergedArgs.status);
  if (status) fields.status = status;

  Object.assign(job, fields);
  const shaped = await shapeJobForTalentPool({
    title: fields.title as string || job.title || job.roleTitle,
    description: fields.description as string || job.description,
    builderWillDo: fields.builderWillDo as string || job.builderWillDo,
    skillsNeeded: (fields.skillsNeeded as string[]) || job.skillsNeeded || [],
    niceToHaveSkills: (fields.niceToHaveSkills as string[]) || job.niceToHaveSkills || [],
    requirements: (fields.requirements as string[]) || job.requirements || [],
    responsibilities: (fields.responsibilities as string[]) || job.responsibilities || job.deliverables || [],
    companyContext: [fields.company, fields.startupSummary, job.company, job.startupSummary, job.industry].filter(Boolean).join(' '),
  });
  job.originalSkillsNeeded = shaped.originalSkillsNeeded;
  job.skillsNeeded = shaped.skillsNeeded;
  job.niceToHaveSkills = shaped.niceToHaveSkills;
  job.matchingSkills = shaped.matchingSkills;
  job.poolFitMetadata = shaped.poolFitMetadata;
  await job.save();

  if (session) {
    session.jobId = job._id;
    session.title = job.title || job.roleTitle || session.title;
    await session.save();
  }

  const search = await runSearchForJob(identity, job);
  return {
    job: serializeJob(job),
    updatedFields: Object.keys(fields),
    search,
    message: search.skipped
      ? 'Updated the job. Search needs a bit more detail before I rerun it.'
      : `Updated the job and refreshed search: ${search.totalFound} candidates, ${search.strongCount} strong.`,
  };
}

async function toolUpdateCompany(identity: FounderIdentity, args: Record<string, unknown>) {
  const existing = await getCompany(identity);
  const name = cleanString(args.name) || existing?.name || 'Your startup';
  const set: Record<string, unknown> = {
    founderId: identity.founderId,
    founderEmail: identity.email,
    name,
  };
  for (const key of ['website', 'description', 'mission', 'productSummary', 'industry', 'fundingStage', 'location']) {
    const value = cleanString(args[key]);
    if (value) set[key] = value;
  }
  const company = await CompanyProfile.findOneAndUpdate(
    { founderId: identity.founderId },
    { $set: set },
    { upsert: true, new: true }
  );
  return { company: serializeCompany(company), message: `Cool, updated ${company.name}.` };
}

async function toolSearchTalent(identity: FounderIdentity, args: Record<string, unknown>, session: any) {
  const jobId = cleanString(args.jobId) || cleanString(args.opportunityId) || (session?.jobId ? String(session.jobId) : null);
  if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
    logFounderAgent('tool:search_talent:invalid_job_id', { founderId: identity.founderId, args });
    return { error: 'jobId is required.' };
  }

  const job = await JobPosting.findOne({ _id: jobId, founderEmail: identity.email });
  if (!job) {
    logFounderAgent('tool:search_talent:job_not_found', { founderId: identity.founderId, founderEmail: identity.email, jobId });
    return { error: 'Job not found.' };
  }

  const rawMode = cleanString(args.searchMode);
  const searchMode: SearchMode = rawMode === 'broad' || rawMode === 'strict' ? rawMode : 'balanced';
  const search = await runSearchForJob(identity, job, searchMode);

  if (session) {
    session.jobId = job._id;
    session.title = job.title || job.roleTitle || session.title;
    await session.save();
  }

  return {
    job: serializeJob(job),
    search,
    shortlist: (search as any).shortlist || null,
    message: search.skipped
      ? `Need a little more detail before I search: ${search.reason}`
      : `Cool, I searched talent for ${job.title || job.roleTitle}. Found ${search.totalFound} candidates, ${search.strongCount} strong.`,
  };
}

async function runTool(name: string, identity: FounderIdentity, session: any, args: Record<string, unknown>, userText: string, company: any): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  logFounderAgent('tool:start', {
    tool: name,
    founderId: identity.founderId,
    sessionId: session?._id ? String(session._id) : null,
    jobId: session?.jobId ? String(session.jobId) : null,
    args,
  });
  try {
    let result: Record<string, unknown>;
    switch (name) {
      case 'create_job':
        result = await toolCreateJob(identity, session, args, userText, company);
        break;
      case 'fetch_jobs':
        result = await toolFetchJobs(identity);
        break;
      case 'fetch_job':
        result = await toolFetchJob(identity, args, session);
        break;
      case 'edit_job':
        result = await toolEditJob(identity, args, session);
        break;
      case 'search_talent':
        result = await toolSearchTalent(identity, args, session);
        break;
      case 'update_company_info':
        result = await toolUpdateCompany(identity, args);
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }
    logFounderAgent('tool:done', {
      tool: name,
      durationMs: Date.now() - startedAt,
      hasError: Boolean(result.error),
      resultKeys: Object.keys(result),
    });
    return result;
  } catch (error) {
    logFounderAgentError('tool:error', error, {
      tool: name,
      durationMs: Date.now() - startedAt,
      args,
    });
    return {
      error: error instanceof Error ? error.message : 'Tool failed.',
      tool: name,
    };
  }
}

export async function runFounderAgentChat(params: {
  identity: FounderIdentity;
  sessionId?: string | null;
  jobId?: string | null;
  message: string;
}) {
  const chatStartedAt = Date.now();
  await connectAdminDB();
  logFounderAgent('chat:start', {
    founderId: params.identity.founderId,
    founderEmail: params.identity.email,
    sessionId: params.sessionId || null,
    jobId: params.jobId || null,
    messageLength: params.message.length,
  });

  const session = await getOrCreateSession(params.identity, {
    sessionId: params.sessionId || null,
    jobId: params.jobId || null,
  });
  const company = await getCompany(params.identity);
  const currentJob = session.jobId
    ? await JobPosting.findOne({ _id: session.jobId, founderEmail: params.identity.email })
    : null;

  await appendMessage({
    identity: params.identity,
    session,
    role: 'founder',
    content: params.message,
    jobId: currentJob?._id || session.jobId || null,
  });

  const historyDocs = await FounderChatMessage.find({ sessionId: session._id })
    .sort({ createdAt: 1 })
    .limit(40)
    .lean();

  const context = {
    founder: { id: params.identity.founderId, name: params.identity.founderName, email: params.identity.email },
    company: serializeCompany(company),
    currentJob: serializeJob(currentJob),
    session: serializeSession(session),
  };

  const messages: AgentMessage[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nContext JSON:\n${JSON.stringify(context)}` },
    ...historyDocs.slice(-20).map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: m.content,
    })),
  ];

  let agentResponse = await generateOpenRouterAgentTurn({
    messages,
    tools: TOOLS,
    temperature: 0.25,
    maxTokens: 500,
  });
  logFounderAgent('chat:model_response', {
    sessionId: String(session._id),
    toolCalls: (agentResponse.tool_calls || []).map((tool) => tool.function.name),
    hasContent: Boolean(agentResponse.content),
  });

  const toolCalls: ChatToolCall[] = [];
  let iterations = 0;
  while (agentResponse.tool_calls?.length && iterations < 4) {
    iterations++;
    messages.push({
      role: 'assistant',
      content: agentResponse.content ?? null,
      tool_calls: agentResponse.tool_calls,
    });

    for (const toolCall of agentResponse.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        args = {};
      }
      const result = await runTool(toolCall.function.name, params.identity, session, args, params.message, company);
      toolCalls.push({ name: toolCall.function.name, args, result });
      await appendMessage({
        identity: params.identity,
        session,
        role: 'tool',
        content: JSON.stringify(result),
        toolName: toolCall.function.name,
        toolResult: result,
        jobId: (result as any)?.job?._id || session.jobId || null,
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    try {
      agentResponse = await generateOpenRouterAgentTurn({
        messages,
        tools: TOOLS,
        temperature: 0.25,
        maxTokens: 500,
      });
      logFounderAgent('chat:model_response_after_tool', {
        sessionId: String(session._id),
        iteration: iterations,
        toolCalls: (agentResponse.tool_calls || []).map((tool) => tool.function.name),
        hasContent: Boolean(agentResponse.content),
      });
    } catch (error) {
      logFounderAgentError('chat:model_after_tool_failed', error, {
        sessionId: String(session._id),
        iteration: iterations,
        lastTool: toolCalls.at(-1)?.name,
      });
      agentResponse = {
        content: toolCalls.at(-1)?.result?.message
          ? String(toolCalls.at(-1)?.result?.message)
          : 'Cool, I handled that.',
      };
      break;
    }
  }

  const finalMessage =
    agentResponse.content ||
    toolCalls.at(-1)?.result?.message ||
    'Cool, I updated that.';

  await appendMessage({
    identity: params.identity,
    session,
    role: 'assistant',
    content: String(finalMessage),
    jobId: session.jobId || currentJob?._id || null,
  });

  const [freshSession, freshCompany, freshJob, freshMessages] = await Promise.all([
    FounderChatSession.findById(session._id).lean(),
    getCompany(params.identity).then((doc) => doc?.toObject ? doc.toObject() : doc),
    session.jobId ? JobPosting.findById(session.jobId).lean() : Promise.resolve(null),
    FounderChatMessage.find({ sessionId: session._id, role: { $in: ['founder', 'assistant'] } })
      .sort({ createdAt: 1 })
      .limit(80)
      .lean(),
  ]);

  const response = {
    message: String(finalMessage),
    session: serializeSession(freshSession),
    job: serializeJob(freshJob),
    company: serializeCompany(freshCompany),
    history: freshMessages.map(serializeMessage),
    toolCalls,
    meta: { model: getOpenRouterChatModel(), iterations },
  };
  logFounderAgent('chat:done', {
    sessionId: response.session?.id || String(session._id),
    jobId: response.job?.id || null,
    toolCalls: toolCalls.map((tool) => tool.name),
    durationMs: Date.now() - chatStartedAt,
  });
  return response;
}

export async function getFounderAgentChatState(identity: FounderIdentity, params: { sessionId?: string | null; jobId?: string | null }) {
  await connectAdminDB();
  const session = params.sessionId || params.jobId
    ? await getOrCreateSession(identity, params)
    : null;
  const messages = session
    ? await FounderChatMessage.find({ sessionId: session._id, role: { $in: ['founder', 'assistant'] } })
        .sort({ createdAt: 1 })
        .limit(80)
        .lean()
    : [];
  const [company, job] = await Promise.all([
    getCompany(identity),
    session?.jobId ? JobPosting.findById(session.jobId).lean() : Promise.resolve(null),
  ]);
  return {
    session: serializeSession(session),
    company: serializeCompany(company),
    job: serializeJob(job),
    history: messages.map(serializeMessage),
  };
}

export async function getFounderJobs(identity: FounderIdentity) {
  await connectAdminDB();
  const [jobs, sessions, company] = await Promise.all([
    JobPosting.find({ founderEmail: identity.email, status: { $nin: ['closed'] } })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),
    FounderChatSession.find({ founderId: identity.founderId, status: 'active' })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean(),
    getCompany(identity),
  ]);
  return {
    jobs: jobs.map(serializeJob),
    sessions: sessions.map(serializeSession),
    company: serializeCompany(company),
  };
}

export async function handleJobAction(identity: FounderIdentity, body: any) {
  await connectAdminDB();
  const action = body?.action || 'fetch_jobs';
  const payload = body?.payload || {};
  if (action === 'fetch_jobs') return toolFetchJobs(identity);
  if (action === 'fetch_job') return toolFetchJob(identity, payload, null);
  if (action === 'update_company_info') return toolUpdateCompany(identity, payload);

  if (action === 'rerun_job_search' || action === 'search_talent') return toolSearchTalent(identity, payload, null);

  const session = await getOrCreateSession(identity, {
    sessionId: payload.sessionId || null,
    jobId: payload.jobId || payload.opportunityId || null,
  });
  const company = await getCompany(identity);
  return runTool(action, identity, session, payload, JSON.stringify(payload), company);
}

export async function getFounderDashboard(identity: FounderIdentity) {
  await connectAdminDB();
  const opportunities = await JobPosting.find({
    founderEmail: identity.email,
    status: { $nin: ['closed'] },
  }).sort({ updatedAt: -1 }).lean();

  const opportunityIds = opportunities.map((o: any) => o._id);
  const shortlistDocs = await Shortlist.find({ opportunityId: { $in: opportunityIds } }).lean();
  const oppById = new Map(opportunities.map((o: any) => [String(o._id), o]));

  const shortlists = await Promise.all(
    shortlistDocs.map(async (sl: any) => {
      const pub = toPublicShortlist(sl);
      if (!pub) return null;
      const opportunity = oppById.get(String(sl.opportunityId));
      const fullCandidates = await buildFullCandidatesForShortlist(sl, opportunity, {
        BuilderProfile,
        ProjectRecord,
        MatchRecord,
      });
      return { ...pub, fullCandidates: fullCandidates.filter((c: any) => !c.hidden) };
    })
  );

  const shortlistByOpp = new Map(shortlists.filter(Boolean).map((s: any) => [String(s.opportunityId), s]));
  const opportunitiesWithSearch = opportunities.map((opp: any) => {
    const sl = shortlistByOpp.get(String(opp._id));
    return {
      ...serializeJob(opp),
      searchStats: sl
        ? {
            totalMatches: sl.totalMatches,
            strongMatchCount: sl.strongMatchCount,
            previewGenerated: Boolean(sl.previewGeneratedAt),
            locked: !sl.unlocked,
          }
        : null,
    };
  });

  const [pipeline, notifications, unreadNotificationCount, company] = await Promise.all([
    buildFounderPipeline(identity.email, { Opportunity: JobPosting, Shortlist, MatchRecord, BuilderProfile, IntroRequest, CallSchedule }),
    getNotificationsForFounder(identity.email),
    countUnreadForFounder(identity.email),
    getCompany(identity),
  ]);

  return {
    opportunities: opportunitiesWithSearch,
    shortlists: shortlists.filter(Boolean),
    pipeline,
    notifications,
    unreadNotificationCount,
    company: serializeCompany(company),
  };
}
