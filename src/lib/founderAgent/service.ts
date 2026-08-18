import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { runtimeEnvFromLocals, type RuntimeEnv } from '@/lib/workosEnv';
import {
  generateOpenRouterAgentTurn,
  generateOpenRouterReply,
  getOpenRouterChatModel,
  getOpenRouterReasoningModel,
  hasOpenRouterConfig,
  type AgentMessage,
  type ToolDefinition,
} from '@/lib/openrouter';
import '@/models/user.tsx';
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
import AgentWrappedReportModel from '@/models/talent/AgentWrappedReport';
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
import {
  buildConversationAgenda,
  buildFallbackOpener,
  compactFounderContext,
  looksLikeSkillDump,
} from '@/lib/founderAgent/conversationEngine';
import { compileSearchPlan, getPlanRetrievalTerms } from '@/lib/talent/searchPlan';
import { retrieveSemanticBuilderCandidates, type SemanticScoreMap } from '@/lib/talent/embeddings/searchTalentEmbeddings';
import { searchTalentSearchIndex } from '@/lib/talent/searchIndex';
import {
  buildRetrievalChannels,
  mergeChannelBuilders,
  searchLocationChannel,
} from '@/lib/talent/roleShapedRetrieval';
import {
  applyCandidateLimit,
  canCreateRole,
  currentPeriodKey,
  entitlementErrorResponse,
  entitlementSnapshot,
  getFounderEntitlements,
  getFounderUsage,
  recordUsageEvent,
} from '@/lib/billing/entitlements';
import { notifyOps, opsPersonFrom } from '@/lib/opsTelegram';
import {
  BUILDER_SEARCH_SELECT,
  hydrateSearchableBuilderPool,
  profileLimitPoolTarget,
  projectEvidenceSortScore,
  searchableBuilderFilter,
} from '@/lib/talent/searchableBuilderPool';
import { buildRequirementFindings } from '@/lib/talent/searchTokens';
import {
  inferSponsorshipNeed,
  opportunityDoesNotSponsor,
  shouldHardExcludeForSponsorship,
} from '@/lib/talent/sponsorshipInference';
import {
  evaluateGithubActivityRequirement,
  isGithubActivityRequirement,
  readCachedGithubActivity,
} from '@/lib/talent/githubActivity';
import { evaluateMustHaveGate } from '@/lib/talent/discovery/mustHaveGate';
import { resolveBuilderBaseLocation, summarizeShortlistLocations } from '@/lib/talent/builderLocation';
import { buildPoolSummary, renderPoolSummaryMarkdown, type PoolSummary } from '@/lib/talent/poolSummary';
import FounderProfile from '@/models/talent/FounderProfile';

const User: any = mongoose.models.User;

export type FounderIdentity = {
  founderId: string;
  email: string;
  founderName: string;
  accountType?: string | null;
  onboardingStatus?: string | null;
};

type ChatToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

type RetrievalMode = 'cached_shortlist' | 'search_index' | 'semantic' | 'hybrid' | 'keyword_fallback' | 'limited_broad_fallback';
const DEFAULT_EQUITY = 'No';
const DEFAULT_VISA_SPONSORSHIP = 'Yes';

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
- Talk like a real person texting a founder, not an AI assistant. Warm, direct, a little casual. Never say things like "as an AI", "I'd be happy to", "let me assist you", or other assistant-speak.
- Never use em-dashes (—) or en-dashes (–). Use a comma, a period, or split into two sentences instead.
- Keep simple acknowledgements short. For a new search, rerank, comparison, or talent-pool question, use concise Markdown with headings and bullets.
- Never use markdown tables (| col | col |). Always use numbered lists and short bullets instead. Chat is too narrow for tables.
- Do not split a structured Markdown response into artificial separate messages.
- Say things like "Cool, got it" only when it actually adds something.
- Ask ONE focused follow-up when a required detail is missing. Never stack multiple questions in one message.

Personalization (critical):
- Context JSON includes conversationAgenda, founderProfile, and company enrichment. Follow agenda.nextQuestionHint and agenda.doNotAsk.
- Lead with the company/product by name when you know it. Never ask generic questions that ignore enrichment.
- If agenda.doNotAsk includes what_will_they_build, do NOT ask what they will build. Use product context and move to the next gap.
- If the founder pastes a long skills dump (or skillsAreBloated), distill to 3–6 must-have technologies and put the rest in niceToHaveSkills via edit_job. Confirm that split. Never store 15+ skills as must-haves.

Rules:
- You have two jobs: conversation and tool use.
- Use chat history and company/job context before asking.
- One chat session maps to one role/job. Do not mix role context across sessions.
- Be proactive: finish a strong brief, then search. Stop over-asking once the brief is solid.
- Treat founder phrases like "build a chat interface" or "the product in general" as description. If they say broader product, write description from company enrichment.
- Default policy before confirmation: visa sponsorship Yes, equity No. Confirm BOTH once. Parse multi-intent replies in one turn (e.g. "yes I'll pay 120k", "no visa", "yes equity").
- Once visaConfirmed or equityConfirmed is true in context, NEVER re-ask that topic.
- Use create_job / edit_job as the structured contract. Auto-fill responsibilities from company + role when missing.
- Keep preferences as searchRequirements with importance "must" or "nice".
- Use edit_job to persist answers before the next question. On thin roles, edit does not mean you searched — do not claim you pulled builders.
- When announcing a search, you MUST call search_talent in the same turn.

Shortlist control (you have full CRUD):
- list_shortlist: see who is in the pool with sponsorship signals.
- remove_builders: remove someone from this role's recommendations by name or id.
- keep_builders: REPLACE the recommendations pane with only the builders who match the founder's filter (by id or name). Use this when they ask to narrow/show/filter the list.
- exclude_builders: permanently exclude them from future searches for this role.
- refresh_shortlist: re-apply visa/must-have/exclusion filters to the current pool (use after visa=No or removals).
- search_talent: full re-run under current constraints.
- inspect_talent_pool: read-only evidence for comparisons. It does NOT change the Recommendations pane.

Location questions (critical):
- If the founder asks where the builders are, whether you found people in a city (e.g. Mumbai), or how the shortlist splits geographically, call list_shortlist or inspect_talent_pool and use locationMix.
- Quote locationMix.summary. If one builder is in the requested city and the rest are elsewhere in the requested country, say that plainly: for example "We found 1 builder in Mumbai. The rest are from other parts of India."
- Do not claim the whole shortlist is in the preferred city unless locationMix.requestedCityCount equals the shortlist size.
- Per-builder location is on each row. Never invent a city.

Filtering / "give me someone who…" / "show only…" (critical):
- If the founder asks to filter, narrow, or change who appears in recommendations (e.g. no ASU on-campus job, only remote, drop interns), you MUST update the shortlist with tools in the SAME turn — not just answer in chat.
- Workflow: inspect_talent_pool (or list_shortlist) → keep_builders with the matching people (preferred) OR remove_builders for everyone who fails the filter → briefly say who remains.
- Optionally persist lasting preferences via edit_job searchRequirements (importance "must"). If the kept pool is empty or thinner than ~3, call search_talent after saving the preference.
- Never list filtered names in chat while leaving the Recommendations pane unchanged. The pane is the source of truth.

Sponsorship / pool complaints:
- If the founder says a named builder needs sponsorship AND they do not want to sponsor, that is NOT a request to flip visa to Yes. Set/confirm visa=No, remove_builders or exclude_builders for that person, then refresh_shortlist or search_talent. Tell them who was removed.
- When visa is No, builders who need sponsorship must leave the pool. If anyone remains who need sponsorship, remove them immediately.

After search:
- Mention the Recommended tab once. Do not repeat "look at the pane on the right" on every edit or follow-up.
- Be evidence-grounded. Missing evidence is unknown, not a negative.`;

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
          searchRequirements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                importance: { type: 'string', enum: ['must', 'nice'] },
              },
            },
          },
          responsibilities: { type: 'array', items: { type: 'string' } },
          salary: { type: 'string', description: 'Founder-provided salary or compensation range.' },
          equity: { type: 'string', description: 'Equity policy. Defaults to No only after the founder confirms it.' },
          visa: { type: 'string', description: 'Visa sponsorship policy. Defaults to Yes only after the founder confirms it.' },
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
          searchRequirements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                importance: { type: 'string', enum: ['must', 'nice'] },
              },
            },
          },
          responsibilities: { type: 'array', items: { type: 'string' } },
          salary: { type: 'string', description: 'Founder-provided salary or compensation range.' },
          equity: { type: 'string', description: 'Equity policy. Defaults to No only after the founder confirms it.' },
          visa: { type: 'string', description: 'Visa sponsorship policy. Defaults to Yes only after the founder confirms it.' },
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
      name: 'inspect_talent_pool',
      description:
        'Read-only: inspect evidence from the current shortlist to answer talent-pool questions, including where builders are located. Does NOT update the Recommendations pane. If the founder asked to filter/narrow who is recommended, follow up with keep_builders or remove_builders in the same turn.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job ID. Omit to use the active role.' },
          question: { type: 'string', description: 'The founder question or comparison to investigate.' },
          builderIds: { type: 'array', items: { type: 'string' }, description: 'Optional shortlisted builders to inspect.' },
          fields: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['profile', 'projects', 'experience', 'github_activity', 'sponsorship', 'public_presence', 'ranking_evidence'],
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_shortlist',
      description: 'List builders currently recommended for this role, including location and sponsorship inference. Use this to answer where people are (city/country mix) before remove/exclude decisions.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job ID. Omit to use the active role session job.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_builders',
      description: 'Remove one or more builders from this role shortlist by builder id or name. Does not permanently ban them unless you also call exclude_builders.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          builderIds: { type: 'array', items: { type: 'string' } },
          builderNames: { type: 'array', items: { type: 'string' }, description: 'Match shortlisted builders by first/full name.' },
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'keep_builders',
      description:
        'Narrow the Recommendations pane to ONLY these builders (by id or name). Removes everyone else from the shortlist. Use when the founder asks to filter/show only people matching a criterion after you inspected the pool.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          builderIds: { type: 'array', items: { type: 'string' } },
          builderNames: { type: 'array', items: { type: 'string' }, description: 'Match shortlisted builders by first/full name.' },
          reason: { type: 'string', description: 'Why these builders were kept (shown in logs / reply context).' },
          hideOthers: {
            type: 'boolean',
            description: 'Default true. Hide removed builders so they do not reappear until a fresh search.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exclude_builders',
      description: 'Permanently exclude builders from this role shortlist AND future searches (stored on the job). Use when the founder rejects someone or they violate hard constraints like sponsorship.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          builderIds: { type: 'array', items: { type: 'string' } },
          builderNames: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'refresh_shortlist',
      description: 'Re-apply hard filters (visa sponsorship, exclusions, must-haves) to the current shortlist without a full discovery run when possible. Call after visa=No or removals. Falls back to search_talent if the pool is empty.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          rerunSearchIfEmpty: { type: 'boolean', description: 'Default true. If filtering empties the pool, run a fresh search.' },
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

function buildSearchableBuilderFilter(extra: Record<string, unknown> = {}) {
  return searchableBuilderFilter(extra);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSearchTerms(opportunity: any, strategy: ReturnType<typeof buildSearchStrategy>) {
  const values = [
    ...(Array.isArray(opportunity.matchingSkills) ? opportunity.matchingSkills : []),
    ...(Array.isArray(opportunity.skillsNeeded) ? opportunity.skillsNeeded : []),
    ...(Array.isArray(opportunity.niceToHaveSkills) ? opportunity.niceToHaveSkills : []),
    ...(Array.isArray(opportunity.searchRequirements)
      ? opportunity.searchRequirements.map((requirement: any) => requirement?.text)
      : []),
    ...(Array.isArray(opportunity.requirements) ? opportunity.requirements : []),
    ...getPlanRetrievalTerms(opportunity.searchPlan),
    ...strategy.mustHaveSignals,
    ...strategy.niceToHaveSignals,
    ...strategy.semanticConcepts,
  ];

  return [...new Set(
    values
      .map((value) => String(value).trim())
      .filter((value) => value.length >= 2 && value.length <= 48)
      .map((value) => value.toLowerCase())
  )].slice(0, 24);
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
        { skills: { $in: regexes } },
        { headline: { $in: regexes } },
        { 'experiences.skills': { $in: regexes } },
        { 'experiences.company': { $in: regexes } },
        { 'experiences.title': { $in: regexes } },
        { 'education.school': { $in: regexes } },
        { universityOrCompany: { $in: regexes } },
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

function billingErrorJson(result: ReturnType<typeof entitlementErrorResponse>, status = 402) {
  return new Response(JSON.stringify({ success: false, ...result }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export { okJson, errorJson, billingErrorJson };

export async function resolveFounderIdentity(request: Request, locals?: App.Locals): Promise<FounderIdentity | { error: string; status: number }> {
  const runtime = runtimeEnvFromLocals(locals as App.Locals);
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
  const user = await User.findById(decoded.userId)
    .select('name role email accountType onboardingStatus')
    .lean();
  if (user?.name) founderName = user.name;
  if (user?.role) role = String(user.role);

  if (role !== 'founder') {
    return { error: 'Founder account required.', status: 403 };
  }

  return {
    founderId: decoded.userId ? String(decoded.userId) : email,
    email,
    founderName,
    accountType: user?.accountType ?? null,
    onboardingStatus: user?.onboardingStatus ?? null,
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

type SearchRequirement = {
  text: string;
  importance: 'must' | 'nice';
};

function normalizeSearchRequirements(value: unknown, fallbackImportance: SearchRequirement['importance'] = 'must'): SearchRequirement[] {
  const rawItems = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set<string>();
  const requirements: SearchRequirement[] = [];

  for (const item of rawItems) {
    const text =
      typeof item === 'string'
        ? item.trim()
        : item && typeof item === 'object' && typeof (item as any).text === 'string'
          ? (item as any).text.trim()
          : '';
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const importance =
      item && typeof item === 'object' && (item as any).importance === 'nice'
        ? 'nice'
        : fallbackImportance;
    requirements.push({ text: text.slice(0, 180), importance });
  }

  return requirements.slice(0, 12);
}

function mergeSearchRequirements(...groups: SearchRequirement[][]): SearchRequirement[] {
  const merged = new Map<string, SearchRequirement>();
  for (const group of groups) {
    for (const requirement of group) {
      const key = requirement.text.toLowerCase();
      const existing = merged.get(key);
      if (!existing || existing.importance === 'nice' && requirement.importance === 'must') {
        merged.set(key, requirement);
      }
    }
  }
  return Array.from(merged.values()).slice(0, 12);
}

function searchRequirementTexts(value: unknown): string[] {
  return normalizeSearchRequirements(value).map((requirement) => requirement.text);
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

function founderExplicitlySkippedPreferences(text: string) {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return false;
  if (/^(no|nope|none|nothing|skip|flexible|open|anyone|any builder|not sure|no preference|no preferences|no prefs)$/i.test(normalized)) {
    return true;
  }
  return /\b(no|none|nope|nothing|skip|flexible|open|not sure|no preferences?|no prefs?)\b/i.test(normalized)
    && /\b(preferences?|requirements?|must[-\s]?haves?|nice[-\s]?to[-\s]?haves?|proof|background|internships?|schools?|projects?|experience|filters?)\b/i.test(normalized);
}

function normalizeEquity(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  if (/^(no|none|nope|0|false|not offering|no equity)$/i.test(text)) return DEFAULT_EQUITY;
  if (/^(yes|y|true)$/i.test(text)) return 'Yes';
  return text;
}

function isAffirmative(text: string) {
  return /^(yes|yeah|yep|correct|right|ok|okay|sounds good|confirmed|confirm|sure)$/i.test(text.trim());
}

function founderAffirmedPendingQuestion(text: string) {
  const match = text.match(/founder replied:\s*"([^"]+)"/i);
  return match ? isAffirmative(match[1]) : false;
}

function resolveEquity(args: Record<string, unknown>, userText: string, metadata: Record<string, any> = {}) {
  const explicit = normalizeEquity(args.equity ?? args.equityOffered);
  if (explicit) return { equity: explicit, confirmed: true };

  const normalized = userText.toLowerCase();
  if (/\b(yes equity|equity yes|with equity|offer equity|equity is yes)\b/.test(normalized)) {
    return { equity: 'Yes', confirmed: true };
  }
  if (/\b(no equity|without equity|equity is no|equity no|no stock|no options)\b/.test(normalized)) {
    return { equity: DEFAULT_EQUITY, confirmed: true };
  }
  if ((metadata.defaultEquityConfirmationAsked || metadata.defaultCompensationConfirmationAsked) && isAffirmative(userText)) {
    return { equity: DEFAULT_EQUITY, confirmed: true };
  }
  if (founderAffirmedPendingQuestion(userText) && /\bequity\s+(?:to|is)\s+no\b/i.test(userText)) {
    return { equity: DEFAULT_EQUITY, confirmed: true };
  }
  if (metadata.defaultEquityConfirmed) {
    return { equity: DEFAULT_EQUITY, confirmed: true };
  }

  return { equity: DEFAULT_EQUITY, confirmed: false };
}

function normalizeVisa(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  if (/^(yes|y|true)$/i.test(text)) return DEFAULT_VISA_SPONSORSHIP;
  if (/^(no|none|nope|false)$/i.test(text)) return 'No';
  return text;
}

function resolveVisa(args: Record<string, unknown>, userText: string, metadata: Record<string, any> = {}) {
  const explicit = normalizeVisa(args.visa ?? args.visaType ?? args.sponsorship ?? args.visaSponsorship);
  if (explicit) return { visa: explicit, confirmed: true };

  const normalized = userText.toLowerCase();
  if (
    /\b(no visa|no sponsorship|without sponsorship|do not sponsor|don't sponsor|dont sponsor|i don'?t want to sponsor|will not sponsor|won'?t sponsor)\b/.test(
      normalized
    )
  ) {
    return { visa: 'No', confirmed: true };
  }
  if (/\b(yes visa|visa yes|will sponsor|ok to sponsor|can sponsor)\b/.test(normalized)) {
    return { visa: DEFAULT_VISA_SPONSORSHIP, confirmed: true };
  }
  // Bare "no" while a visa confirmation was pending.
  if (
    (metadata.defaultVisaConfirmationAsked || metadata.defaultCompensationConfirmationAsked) &&
    /^(no|nope|nah)\b/i.test(normalized.trim())
  ) {
    return { visa: 'No', confirmed: true };
  }
  if ((metadata.defaultVisaConfirmationAsked || metadata.defaultCompensationConfirmationAsked) && isAffirmative(userText)) {
    return { visa: DEFAULT_VISA_SPONSORSHIP, confirmed: true };
  }
  if (founderAffirmedPendingQuestion(userText) && /\bvisa sponsorship\s+(?:to|is)\s+yes\b/i.test(userText)) {
    return { visa: DEFAULT_VISA_SPONSORSHIP, confirmed: true };
  }
  if (metadata.defaultVisaConfirmed) {
    return { visa: DEFAULT_VISA_SPONSORSHIP, confirmed: true };
  }

  return { visa: DEFAULT_VISA_SPONSORSHIP, confirmed: false };
}

function createJobCompensationMessage(missing: string[]) {
  const needsSalary = missing.includes('salary/compensation');
  const needsVisa = missing.includes('visa sponsorship confirmation');
  const needsEquity = missing.includes('equity confirmation');

  if (needsSalary && needsVisa && needsEquity) {
    return 'What salary range should I use? I can set visa sponsorship to Yes and equity to No if that works for you.';
  }
  if (needsSalary && needsVisa) {
    return 'What salary range should I use? I can set visa sponsorship to Yes if that works.';
  }
  if (needsSalary && needsEquity) {
    return 'What salary range should I use? I can set equity to No if that works.';
  }
  if (needsVisa && needsEquity) {
    return 'Quick one before I search. Cool if I set visa sponsorship to Yes and equity to No?';
  }
  if (needsSalary) return 'What salary range should I use for this role?';
  if (needsVisa) return 'Cool if I set visa sponsorship to Yes?';
  if (needsEquity) return 'Cool if I set equity to No?';
  return 'What compensation details should I use?';
}

/**
 * Founder-facing message after a search runs.
 * When the pool has no relevant builders, say that clearly — never invent closest fits.
 */
function searchResultMessage(search: any, prefix = ''): string {
  if (typeof search?.poolNarrative === 'string' && search.poolNarrative.trim()) {
    return `${prefix ? `${prefix.trim()}\n\n` : ''}${search.poolNarrative.trim()}`;
  }
  const total = Number(search?.totalFound || 0);
  const strong = Number(search?.strongCount || 0);
  const noRelevant =
    Boolean(search?.noRelevantMatches) ||
    Boolean(search?.searchQuality?.noRelevantMatches) ||
    Boolean(search?.poolSummary?.noRelevantMatches) ||
    total === 0;
  const head = prefix ? `${prefix} ` : '';
  let base = '';
  if (noRelevant) {
    base = `${head}I scanned the talent pool and **did not find any builders who match this role**. I'm not showing closest-fit alternatives — none cleared the must-haves and relevant evidence for this search. If you want, we can relax a must-have or broaden the role description and try again.`;
  } else if (strong > 0) {
    base = `${head}I found ${strong} strong ${strong === 1 ? 'match' : 'matches'} for this role. They're in the builders pane on the right.`;
  } else {
    base = `${head}I pulled together some builders for this role. Take a look in the pane on the right and tell me what stands out.`;
  }

  const extras: string[] = [];
  const coverageMsg = String(search?.sponsorshipCoverage?.message || '').trim();
  if (coverageMsg) extras.push(coverageMsg);
  if (search?.githubActivityUsed === true) {
    extras.push('GitHub activity from public profiles was used in ranking.');
  } else if (search?.githubActivityUsed === false && total > 0) {
    extras.push('GitHub activity was unavailable for most profiles, so I leaned more on skills and project proof.');
  }
  const locationSummary = String(search?.poolSummary?.locationMix?.summary || '').trim();
  if (locationSummary) extras.push(locationSummary);
  return extras.length ? `${base} ${extras.join(' ')}` : base;
}

async function buildFounderPoolNarrative(summary: PoolSummary): Promise<string> {
  const fallback = renderPoolSummaryMarkdown(summary);
  if (!hasOpenRouterConfig()) return fallback;

  try {
    const emptyPoolRule = summary.noRelevantMatches || summary.candidatesReturned === 0
      ? `The shortlist is EMPTY on purpose. Say clearly that no matching builders were found and that closest-fit / weak alternatives are intentionally not shown. Do not invent or recommend any candidates.`
      : `Include 3-5 top recommendations as a numbered list with short bullets (never a markdown table).`;
    const locationRule = summary.locationMix?.summary
      ? `Location mix is a required fact. Put it in the overview. If a city was requested, say how many builders are in that city versus elsewhere in the country. Do not imply everyone is in the preferred city unless requestedCityCount equals candidatesReturned. Use this sentence if it matches the JSON: "${summary.locationMix.summary}"`
      : `If locations are missing, do not invent cities.`;
    const narrative = await generateOpenRouterReply({
      model: 'reasoning',
      temperature: 0,
      maxTokens: 1300,
      systemPrompt: `You are writing an honest founder-facing hiring summary.
Return Markdown only. Use only the JSON facts supplied. Do not invent qualifications, social activity, work authorization, GitHub activity, locations, or counts.
Include: a short pool overview, location mix when present, material trade-offs, and evidence coverage.
${emptyPoolRule}
${locationRule}
Treat missing evidence as unknown. If a requested preference has no verified matches, say that plainly.`,
      userPrompt: JSON.stringify(summary),
    });
    return narrative.trim() || fallback;
  } catch (error) {
    logFounderAgentError('pool_narrative:reasoning_failed', error);
    return fallback;
  }
}

function shouldUseReasoningModel(message: string) {
  return /\b(search|find|recommend|candidate|builder|talent|shortlist|pool|rerank|compare|why|github|social|twitter|linkedin|sponsorship|visa|best fit|trade-?off|mumbai|location|based|india)\b/i.test(
    message
  );
}

function compactDescription(value: string | null, fallback: string) {
  const text = (value || fallback).replace(/\s+/g, ' ').trim();
  return text.length > 110 ? `${text.slice(0, 107).trimEnd()}...` : text;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallbackResponsibilitiesForJob(params: {
  title?: string | null;
  description?: string | null;
  companyName?: string | null;
  company?: any;
  skills?: string[];
}) {
  const companyName = cleanString(params.companyName) || cleanString(params.company?.name) || 'the company';
  const description = cleanString(params.description)
    || cleanString(params.company?.productSummary)
    || cleanString(params.company?.description)
    || cleanString(params.title)
    || 'the core product';
  const text = description.toLowerCase();
  const skills = (params.skills || []).slice(0, 4);
  const responsibilities = new Set<string>();

  responsibilities.add(`Ship production-ready work for ${compactDescription(description, 'the product')}.`);
  if (/\b(chat|message|inbox|conversation|assistant|agent|ai)\b/.test(text)) {
    responsibilities.add('Build reliable conversational flows, states, and product interactions.');
  } else if (/\b(dashboard|analytics|admin|portal|crm)\b/.test(text)) {
    responsibilities.add('Build clear dashboards, workflows, and data-driven product surfaces.');
  } else if (/\b(mobile|ios|android|react native)\b/.test(text)) {
    responsibilities.add('Build polished mobile experiences across core user flows.');
  } else {
    responsibilities.add(`Turn ${companyName}'s product requirements into shipped features.`);
  }
  if (skills.length) {
    responsibilities.add(`Use ${skills.join(', ')} to implement, test, and iterate quickly.`);
  }
  responsibilities.add('Collaborate directly with the founder on scope, tradeoffs, and launch quality.');

  return Array.from(responsibilities).slice(0, 5);
}

async function inferResponsibilitiesForJob(params: {
  title?: string | null;
  description?: string | null;
  companyName?: string | null;
  company?: any;
  skills?: string[];
}) {
  const fallback = fallbackResponsibilitiesForJob(params);
  if (!hasOpenRouterConfig()) return fallback;

  const companyName = cleanString(params.companyName) || cleanString(params.company?.name) || 'the company';
  const companyContext = [
    cleanString(params.company?.productSummary),
    cleanString(params.company?.description),
    cleanString(params.company?.mission),
    cleanString(params.company?.industry),
  ].filter(Boolean).join(' ');

  try {
    const reply = await generateOpenRouterReply({
      systemPrompt: 'Return only valid JSON in this shape: {"responsibilities":["short responsibility"]}. Write 3-5 concrete responsibilities for an early-stage startup builder role. Use the company context, role title, job description, and skills. Do not include markdown.',
      userPrompt: JSON.stringify({
        roleTitle: params.title || null,
        jobDescription: params.description || null,
        companyName,
        companyContext,
        skills: params.skills || [],
      }),
      temperature: 0.2,
      maxTokens: 260,
    });
    const parsed = parseJsonObject(reply);
    const responsibilities = cleanList((parsed as any)?.responsibilities).slice(0, 5);
    return responsibilities.length ? responsibilities : fallback;
  } catch (error) {
    logFounderAgentError('responsibilities:generate_failed', error, {
      title: params.title || null,
      companyName,
    });
    return fallback;
  }
}

function missingCompensationFields(job: any) {
  const missing: string[] = [];
  if (!cleanString(job?.salary) && !cleanString(job?.budget)) missing.push('salary/compensation');
  if (job?.visaConfirmed !== true) missing.push('visa sponsorship confirmation');
  if (job?.equityConfirmed !== true) missing.push('equity confirmation');
  return missing;
}

function buildCompanyProductDescription(company: any): string | null {
  const companyName = cleanString(company?.name) || 'the company';
  const productContext = cleanString(company?.productSummary)
    || cleanString(company?.description)
    || cleanString(company?.mission)
    || cleanString(company?.industry);
  if (!productContext) return null;
  return `Work across ${companyName}'s product: ${productContext}`;
}

function inferBuilderWillDoFromFounderText(text: string, company: any): string | null {
  const cleaned = cleanString(text);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();

  if (/\b(whole|entire|overall|broader|general)\s+product\b|\bproduct\s+in\s+general\b|\bacross\s+the\s+product\b|\bfull\s+product\b/.test(lower)) {
    return buildCompanyProductDescription(company);
  }

  const hasBuildIntent = /\b(build|building|create|creating|make|making|ship|shipping|develop|developing|implement|implementing|work on|working on)\b/.test(lower);
  const hasProductArtifact = /\b(interface|dashboard|feature|product|app|website|platform|agent|assistant|chat|messaging|inbox|workflow|automation|portal|api|backend|frontend)\b/.test(lower);
  if (!hasBuildIntent && !hasProductArtifact) return null;
  if (/^(fullstack|full-stack|frontend|front-end|backend|back-end|developer|engineer|builder)\b/i.test(cleaned) && cleaned.split(/\s+/).length <= 4) {
    return null;
  }

  return cleaned.length > 180 ? cleaned.slice(0, 177).trimEnd() + '...' : cleaned;
}

function inferBuilderWillDoFromMessages(messages: any[], company: any): string | null {
  for (const message of [...messages].reverse()) {
    if (message?.role !== 'founder') continue;
    const inferred = inferBuilderWillDoFromFounderText(String(message.content || ''), company);
    if (inferred) return inferred;
  }
  return null;
}

function createJobMissingMessage(missing: string[]) {
  if (missing.includes('role/title')) {
    return 'What role/title should I use for this builder?';
  }
  if (missing.includes('what the builder will ship')) {
    return 'Is this builder focused on a specific feature, or the broader product? If it is product-wide, I can use the company context.';
  }
  if (missing.includes('skills')) {
    return 'What stack or skills are must-have? You can also add proof preferences like a chat-feature project, prior internship, school, or experience level.';
  }
  if (missing.includes('company')) {
    return 'What company/startup is this role for?';
  }
  return `Need one thing: ${missing[0]}. What should I use?`;
}

function createJobPreferencesMessage(title: string, description: string) {
  const target = title && title !== 'Builder role' ? `for this ${title}` : 'for this builder';
  const projectHint = /chat|message|inbox|conversation|assistant|ai/i.test(description)
    ? 'a project with a chat feature'
    : 'a relevant shipped project';
  return `Any proof or preferences ${target}? For example ${projectHint}, prior internship, school, experience level, or say no preferences.`;
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
    equity: raw.equity || DEFAULT_EQUITY,
    equityConfirmed: raw.equityConfirmed === true,
    visa: raw.visa || DEFAULT_VISA_SPONSORSHIP,
    visaConfirmed: raw.visaConfirmed === true,
    jobType: raw.jobType || raw.workType || raw.roleType?.[0] || null,
    workMode: raw.workMode || raw.locationPreference || null,
    location: raw.location || raw.locationPreference || null,
    searchRequirements: normalizeSearchRequirements(raw.searchRequirements).length
      ? normalizeSearchRequirements(raw.searchRequirements)
      : normalizeSearchRequirements(raw.requirements),
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

async function getFounderProfileDoc(identity: FounderIdentity) {
  return FounderProfile.findOne({
    $or: [{ userId: identity.founderId }, { founderEmail: identity.email }],
  })
    .sort({ updatedAt: -1 })
    .lean();
}

function jobExcludedBuilderIds(job: any): string[] {
  const raw = job?.excludedBuilderIds;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

async function resolveJobForSession(
  identity: FounderIdentity,
  args: Record<string, unknown>,
  session: any
) {
  const jobId = cleanString(args.jobId) || cleanString(args.opportunityId) || (session?.jobId ? String(session.jobId) : null);
  if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) return { error: 'jobId is required.' as const };
  const job = await JobPosting.findOne({ _id: jobId, founderEmail: identity.email });
  if (!job) return { error: 'Job not found.' as const };
  return { job, jobId };
}

function nameMatchesBuilder(builder: any, query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return false;
  const name = String(builder?.name || '').toLowerCase();
  const first = name.split(/\s+/)[0] || '';
  return name === q || first === q || name.includes(q);
}

async function resolveBuildersOnShortlist(params: {
  shortlist: any;
  builderIds?: string[];
  builderNames?: string[];
}) {
  const candidates = Array.isArray(params.shortlist?.candidates) ? params.shortlist.candidates : [];
  const ids = new Set((params.builderIds || []).map(String).filter(Boolean));
  const names = (params.builderNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  const candidateIds = candidates.map((c: any) => String(c.builderId)).filter(Boolean);
  const builders = candidateIds.length
    ? await BuilderProfile.find({ _id: { $in: candidateIds } }).select('_id name workAuthorization education location universityOrCompany').lean()
    : [];
  const byId = new Map(builders.map((b: any) => [String(b._id), b]));

  for (const name of names) {
    for (const builder of builders) {
      if (nameMatchesBuilder(builder, name)) ids.add(String(builder._id));
    }
  }

  const matched = [...ids]
    .filter((id) => candidateIds.includes(id))
    .map((id) => {
      const builder = byId.get(id);
      const inference = builder ? inferSponsorshipNeed(builder) : null;
      return {
        builderId: id,
        name: builder?.name || null,
        sponsorship: inference
          ? { need: inference.need, confidence: inference.confidence, evidence: inference.evidence }
          : null,
      };
    });

  return { matched, builders, byId };
}

async function persistJobExclusions(job: any, builderIds: string[]) {
  const existing = jobExcludedBuilderIds(job);
  const merged = Array.from(new Set([...existing, ...builderIds]));
  job.excludedBuilderIds = merged;
  await job.save();
  return merged;
}

async function toolListShortlist(identity: FounderIdentity, args: Record<string, unknown>, session: any) {
  const resolved = await resolveJobForSession(identity, args, session);
  if ('error' in resolved) return resolved;
  const { job, jobId } = resolved;
  const shortlist = await Shortlist.findOne({ opportunityId: jobId, founderEmail: identity.email });
  if (!shortlist || !Array.isArray(shortlist.candidates) || !shortlist.candidates.length) {
    return {
      jobId,
      builders: [],
      total: 0,
      excludedBuilderIds: jobExcludedBuilderIds(job),
      message: 'No shortlist yet. Run search_talent first.',
    };
  }

  const hidden = new Set((shortlist.hiddenBuilderIds || []).map(String));
  const visible = shortlist.candidates.filter((c: any) => !hidden.has(String(c.builderId)));
  const builderIds = visible.map((c: any) => String(c.builderId));
  const builders = await BuilderProfile.find({ _id: { $in: builderIds } })
    .select('_id name workAuthorization education location universityOrCompany experiences')
    .lean();
  const byId = new Map(builders.map((b: any) => [String(b._id), b]));

  const rows = visible.map((c: any) => {
    const id = String(c.builderId);
    const builder = byId.get(id);
    const inference = builder ? inferSponsorshipNeed(builder) : null;
    const resolved = builder ? resolveBuilderBaseLocation(builder) : { text: null };
    return {
      builderId: id,
      name: builder?.name || c.anonymousLabel || null,
      location: resolved.text,
      matchScore: c.matchScore ?? null,
      matchLabel: c.matchLabel ?? null,
      sponsorship: inference
        ? { need: inference.need, confidence: inference.confidence, evidence: inference.evidence }
        : { need: 'unknown', confidence: 'low', evidence: 'Builder profile missing' },
    };
  });

  const locationMix = summarizeShortlistLocations(
    builders.map((builder: any) => ({
      name: builder.name,
      location: builder.location,
      experiences: builder.experiences,
    })),
    job
  );

  return {
    jobId,
    total: rows.length,
    builders: rows,
    locationMix,
    excludedBuilderIds: jobExcludedBuilderIds(job),
    visa: job.visa || null,
    visaConfirmed: job.visaConfirmed === true,
    shortlistChanged: false,
  };
}

async function toolRemoveBuilders(identity: FounderIdentity, args: Record<string, unknown>, session: any) {
  const resolved = await resolveJobForSession(identity, args, session);
  if ('error' in resolved) return resolved;
  const { job, jobId } = resolved;
  const shortlist = await Shortlist.findOne({ opportunityId: jobId, founderEmail: identity.email });
  if (!shortlist) return { error: 'No shortlist exists. Run search_talent first.' };

  const { matched } = await resolveBuildersOnShortlist({
    shortlist,
    builderIds: cleanList(args.builderIds),
    builderNames: cleanList(args.builderNames),
  });
  if (!matched.length) {
    return { error: 'Could not match any shortlisted builders to remove. Use list_shortlist first.', shortlistChanged: false };
  }

  const removeIds = new Set(matched.map((m) => m.builderId));
  shortlist.candidates = (shortlist.candidates || []).filter((c: any) => !removeIds.has(String(c.builderId)));
  const hidden = new Set((shortlist.hiddenBuilderIds || []).map(String));
  for (const id of removeIds) hidden.add(id);
  shortlist.hiddenBuilderIds = Array.from(hidden);
  shortlist.totalMatches = shortlist.candidates.length;
  shortlist.strongMatchCount = shortlist.candidates.filter((c: any) => c.matchLabel === 'Strong Match').length;
  await shortlist.save();

  const reason = cleanString(args.reason);
  return {
    removed: matched,
    remaining: shortlist.candidates.length,
    reason: reason || null,
    shortlistChanged: true,
    message: `Removed ${matched.map((m) => m.name || m.builderId).join(', ')} from the recommendations.`,
  };
}

async function toolKeepBuilders(identity: FounderIdentity, args: Record<string, unknown>, session: any) {
  const resolved = await resolveJobForSession(identity, args, session);
  if ('error' in resolved) return resolved;
  const { jobId } = resolved;
  const shortlist = await Shortlist.findOne({ opportunityId: jobId, founderEmail: identity.email });
  if (!shortlist) return { error: 'No shortlist exists. Run search_talent first.' };

  const { matched } = await resolveBuildersOnShortlist({
    shortlist,
    builderIds: cleanList(args.builderIds),
    builderNames: cleanList(args.builderNames),
  });
  if (!matched.length) {
    return {
      error: 'Could not match any shortlisted builders to keep. Use list_shortlist or inspect_talent_pool first.',
      shortlistChanged: false,
    };
  }

  const keepOrder = matched.map((m) => m.builderId);
  const keepIds = new Set(keepOrder);
  const before = Array.isArray(shortlist.candidates) ? shortlist.candidates : [];
  const byId = new Map(before.map((c: any) => [String(c.builderId), c]));
  const kept = keepOrder.map((id) => byId.get(id)).filter(Boolean);
  const removed = before
    .filter((c: any) => !keepIds.has(String(c.builderId)))
    .map((c: any) => ({
      builderId: String(c.builderId),
      name: c.anonymousLabel || null,
    }));

  shortlist.candidates = kept;
  const hideOthers = args.hideOthers !== false;
  if (hideOthers) {
    const hidden = new Set((shortlist.hiddenBuilderIds || []).map(String));
    for (const row of removed) hidden.add(row.builderId);
    shortlist.hiddenBuilderIds = Array.from(hidden);
  }
  shortlist.totalMatches = shortlist.candidates.length;
  shortlist.strongMatchCount = shortlist.candidates.filter((c: any) => c.matchLabel === 'Strong Match').length;
  await shortlist.save();

  const reason = cleanString(args.reason);
  return {
    kept: matched,
    removedCount: removed.length,
    remaining: shortlist.candidates.length,
    reason: reason || null,
    shortlistChanged: true,
    message:
      kept.length === 1
        ? `Updated recommendations to show ${matched[0].name || matched[0].builderId}.`
        : `Updated recommendations to ${kept.length} builders matching your filter.`,
  };
}

async function toolExcludeBuilders(identity: FounderIdentity, args: Record<string, unknown>, session: any) {
  const resolved = await resolveJobForSession(identity, args, session);
  if ('error' in resolved) return resolved;
  const { job, jobId } = resolved;
  const shortlist = await Shortlist.findOne({ opportunityId: jobId, founderEmail: identity.email });
  if (!shortlist) return { error: 'No shortlist exists. Run search_talent first.' };

  const { matched } = await resolveBuildersOnShortlist({
    shortlist,
    builderIds: cleanList(args.builderIds),
    builderNames: cleanList(args.builderNames),
  });

  // Also allow excluding by id even if already removed from candidates.
  const extraIds = cleanList(args.builderIds).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const allIds = Array.from(new Set([...matched.map((m) => m.builderId), ...extraIds]));
  if (!allIds.length) {
    return { error: 'Could not match any builders to exclude.', shortlistChanged: false };
  }

  const removeIds = new Set(allIds);
  shortlist.candidates = (shortlist.candidates || []).filter((c: any) => !removeIds.has(String(c.builderId)));
  const hidden = new Set((shortlist.hiddenBuilderIds || []).map(String));
  for (const id of removeIds) hidden.add(id);
  shortlist.hiddenBuilderIds = Array.from(hidden);
  shortlist.totalMatches = shortlist.candidates.length;
  shortlist.strongMatchCount = shortlist.candidates.filter((c: any) => c.matchLabel === 'Strong Match').length;
  await shortlist.save();

  const excluded = await persistJobExclusions(job, allIds);
  const reason = cleanString(args.reason);
  return {
    excluded: matched.length
      ? matched
      : allIds.map((id) => ({ builderId: id, name: null, sponsorship: null })),
    excludedBuilderIds: excluded,
    remaining: shortlist.candidates.length,
    reason: reason || null,
    shortlistChanged: true,
    message: `Excluded ${allIds.length} builder(s) from this role and future searches.`,
  };
}

/**
 * Re-apply visa + exclusion hard filters to the current shortlist (Diya-class fix).
 */
async function toolRefreshShortlist(
  identity: FounderIdentity,
  args: Record<string, unknown>,
  session: any,
  userText = ''
) {
  const resolved = await resolveJobForSession(identity, args, session);
  if ('error' in resolved) return resolved;
  const { job, jobId } = resolved;
  const shortlist = await Shortlist.findOne({ opportunityId: jobId, founderEmail: identity.email });
  if (!shortlist || !Array.isArray(shortlist.candidates) || !shortlist.candidates.length) {
    const rerun = args.rerunSearchIfEmpty !== false;
    if (rerun && !isJobBriefThin(job)) {
      const search = await runSearchForJob(identity, job, 'balanced', { force: true });
      return {
        refreshed: true,
        reranSearch: true,
        shortlistChanged: true,
        search,
        message: searchResultMessage(search, 'Refreshed the pool with a new search.'),
      };
    }
    return { error: 'No shortlist to refresh. Run search_talent first.', shortlistChanged: false };
  }

  const candidateIds = shortlist.candidates.map((c: any) => String(c.builderId)).filter(Boolean);
  const builders = await BuilderProfile.find({ _id: { $in: candidateIds } })
    .select(BUILDER_SEARCH_SELECT)
    .lean();
  const byId = new Map(builders.map((b: any) => [String(b._id), b]));
  const jobDoesNotSponsor = opportunityDoesNotSponsor(job);
  const excluded = new Set(jobExcludedBuilderIds(job));
  const removed: Array<{ builderId: string; name: string | null; reason: string }> = [];

  const kept = shortlist.candidates.filter((c: any) => {
    const id = String(c.builderId);
    if (excluded.has(id)) {
      removed.push({ builderId: id, name: byId.get(id)?.name || null, reason: 'excluded_by_founder' });
      return false;
    }
    const builder = byId.get(id);
    if (!builder) return true;
    const inference = inferSponsorshipNeed(builder);
    if (shouldHardExcludeForSponsorship(inference, jobDoesNotSponsor)) {
      removed.push({
        builderId: id,
        name: builder.name || null,
        reason: `needs_sponsorship (${inference.confidence}): ${inference.evidence}`,
      });
      excluded.add(id);
      return false;
    }
    return true;
  });

  if (removed.length) {
    shortlist.candidates = kept;
    const hidden = new Set((shortlist.hiddenBuilderIds || []).map(String));
    for (const row of removed) hidden.add(row.builderId);
    shortlist.hiddenBuilderIds = Array.from(hidden);
    shortlist.totalMatches = kept.length;
    shortlist.strongMatchCount = kept.filter((c: any) => c.matchLabel === 'Strong Match').length;
    await shortlist.save();
    await persistJobExclusions(job, removed.map((r) => r.builderId));
  }

  if (!kept.length && args.rerunSearchIfEmpty !== false && !isJobBriefThin(job)) {
    const search = await runSearchForJob(identity, job, 'balanced', { force: true });
    return {
      refreshed: true,
      removed,
      reranSearch: true,
      shortlistChanged: true,
      search,
      message: searchResultMessage(
        search,
        removed.length
          ? `Removed ${removed.map((r) => r.name || r.builderId).join(', ')} for sponsorship/exclusions and ran a fresh search.`
          : 'Pool was empty after filters; ran a fresh search.'
      ),
    };
  }

  return {
    refreshed: true,
    removed,
    remaining: kept.length,
    visa: job.visa,
    shortlistChanged: removed.length > 0,
    message: removed.length
      ? `Filtered the pool. Removed ${removed.map((r) => r.name || r.builderId).join(', ')}.`
      : 'Pool already matched the current constraints.',
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

/**
 * A role brief is "thin" (usually pre-created from the 3-question quick intake) until it
 * has a real description, at least two skills, and at least one preference. We must not
 * auto-run the builder search on a thin brief, e.g. when the founder only edits the title.
 */
function isJobBriefThin(job: any): boolean {
  const description = String(job?.description || job?.builderWillDo || '').trim();
  const skills = Array.isArray(job?.skillsNeeded) ? job.skillsNeeded : [];
  const preferences = Array.isArray(job?.searchRequirements) ? job.searchRequirements : [];
  const hasDescription = description.length > 40;
  const hasPreferences = preferences.length > 0;
  return !hasDescription || skills.length < 2 || !hasPreferences;
}

async function collectFailingPriorBuilderIds(jobId: string, opportunity: any): Promise<string[]> {
  if (!jobId) return [];
  const prior = await Shortlist.findOne({ opportunityId: jobId }).select('candidates.builderId').lean();
  const priorIds = Array.isArray((prior as any)?.candidates)
    ? (prior as any).candidates.map((c: any) => String(c?.builderId || '')).filter(Boolean)
    : [];
  if (!priorIds.length) return [];

  const builders = await BuilderProfile.find({ _id: { $in: priorIds } })
    .select(BUILDER_SEARCH_SELECT)
    .lean();
  if (!builders.length) return [];

  const projects = await ProjectRecord.find({ builderId: { $in: builders.map((b: any) => b._id) } })
    .select('builderId projectName description techStack builderContribution links verificationStatus')
    .lean();
  const projectsByBuilder = new Map<string, any[]>();
  for (const project of projects) {
    const key = String(project.builderId);
    const list = projectsByBuilder.get(key) || [];
    list.push(project);
    projectsByBuilder.set(key, list);
  }

  const failing: string[] = [];
  const jobDoesNotSponsor = opportunityDoesNotSponsor(opportunity);
  for (const builder of builders) {
    const builderId = String(builder._id);
    const builderProjects = projectsByBuilder.get(builderId) || [];
    const sponsorship = inferSponsorshipNeed(builder);
    if (shouldHardExcludeForSponsorship(sponsorship, jobDoesNotSponsor)) {
      failing.push(builderId);
      continue;
    }
    const cached = readCachedGithubActivity(builder);
    const githubActivityScore = cached?.source === 'github_api' ? cached.score : null;
    const findings = buildRequirementFindings(opportunity, builder, builderProjects, { githubActivityScore });
    // If the role asks for GitHub activity and we have no score yet, treat as failing the
    // prior card so rediscovery can replace with builders that have fresh activity data.
    const asksGithub = findings.some((f) => isGithubActivityRequirement(f.text));
    if (asksGithub && githubActivityScore == null) {
      const githubFinding = findings.find((f) => isGithubActivityRequirement(f.text));
      if (githubFinding) {
        const evaluated = evaluateGithubActivityRequirement(null);
        githubFinding.met = evaluated.met;
        githubFinding.evidence = evaluated.evidence;
      }
    }
    const gate = evaluateMustHaveGate(opportunity, findings);
    if (!gate.passesMustGate) failing.push(builderId);
  }
  return failing;
}

async function runSearchForJob(
  identity: FounderIdentity,
  job: any,
  searchMode: SearchMode = 'balanced',
  options: { force?: boolean } = {}
) {
  const startedAt = Date.now();
  const { entitlements } = await getFounderEntitlements(identity);
  const oppPlain = typeof job.toObject === 'function' ? job.toObject() : job;
  const jobId = String(oppPlain._id || job._id || '');
  const profileLimit = entitlements.profileLimitPerRole ?? 50;
  const candidateResultLimit = profileLimit;
  const poolTarget = profileLimitPoolTarget(entitlements.profileLimitPerRole);
  logFounderAgent('search_talent:start', {
    founderId: identity.founderId,
    founderEmail: identity.email,
    jobId,
    title: oppPlain.title || oppPlain.roleTitle,
    searchMode,
  });
  if (!Array.isArray(oppPlain.matchingSkills) || oppPlain.matchingSkills.length === 0 || options.force) {
    logFounderAgent('search_talent:shape_job:start', { jobId });
    const shaped = await shapeJobForTalentPool({
      title: oppPlain.title || oppPlain.roleTitle,
      description: oppPlain.description,
      builderWillDo: oppPlain.builderWillDo,
      skillsNeeded: oppPlain.skillsNeeded,
      niceToHaveSkills: oppPlain.niceToHaveSkills,
      requirements: [
        ...(oppPlain.requirements || []),
        ...searchRequirementTexts(oppPlain.searchRequirements),
      ],
      responsibilities: oppPlain.responsibilities || oppPlain.deliverables,
      companyContext: [oppPlain.company, oppPlain.industry].filter(Boolean).join(' '),
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
      skillsNeeded: shaped.skillsNeeded,
      niceToHaveSkills: shaped.niceToHaveSkills,
      matchingSkills: shaped.matchingSkills,
      poolFitMetadata: shaped.poolFitMetadata,
    });
    logFounderAgent('search_talent:shape_job:done', {
      jobId,
      skillsNeeded: shaped.skillsNeeded,
      matchingSkills: shaped.matchingSkills,
      poolConfidence: shaped.poolFitMetadata?.confidence,
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
  // `force` (used after an explicit edit) always re-runs so new requirements actually
  // re-rank the shortlist instead of returning the previously cached candidates.
  if (!options.force && lastSearchAt && updatedAt && updatedAt.getTime() <= lastSearchAt.getTime() + 5000) {
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

  // Compile a role-shaped search plan once (cached on job until JD/requirements change).
  // Always compile when the role has enough signal — dimensions matter even without must/nice prefs.
  {
    const openRequirementsForPlan = normalizeSearchRequirements(oppPlain.searchRequirements).length
      ? normalizeSearchRequirements(oppPlain.searchRequirements)
      : normalizeSearchRequirements(oppPlain.requirements);
    const hasRoleSignal = Boolean(
      oppPlain.roleTitle ||
        oppPlain.title ||
        oppPlain.builderWillDo ||
        oppPlain.description ||
        (oppPlain.skillsNeeded || []).length ||
        openRequirementsForPlan.length
    );
    if (hasRoleSignal) {
      logFounderAgent('search_talent:compile_search_plan:start', {
        jobId,
        requirementCount: openRequirementsForPlan.length,
        cachedHash: oppPlain.searchPlan?.sourceHash || null,
        cachedVersion: oppPlain.searchPlan?.version || null,
      });
      const searchPlan = await compileSearchPlan(oppPlain);
      job.searchPlan = searchPlan;
      oppPlain.searchPlan = searchPlan;
      await job.save();
      logFounderAgent('search_talent:compile_search_plan:done', {
        jobId,
        compiledBy: searchPlan.compiledBy,
        roleFamily: searchPlan.roleFamily,
        dimensionCount: searchPlan.evidenceDimensions.length,
        dimensions: searchPlan.evidenceDimensions.map((dimension) => ({
          id: dimension.id,
          weight: dimension.weight,
        })),
        retrievalTermCount: searchPlan.retrievalTerms.length,
        matchTokenCount: searchPlan.requirements.reduce((sum, item) => sum + item.matchAnyOf.length, 0),
      });
    } else if (job.searchPlan) {
      job.searchPlan = null;
      oppPlain.searchPlan = null;
      await job.save();
    }
  }

  const strategy = buildSearchStrategy({ opportunity: oppPlain, founderId: identity.founderId, searchMode });
  const openRequirements = normalizeSearchRequirements(oppPlain.searchRequirements).length
    ? normalizeSearchRequirements(oppPlain.searchRequirements)
    : normalizeSearchRequirements(oppPlain.requirements);
  let semanticScores: SemanticScoreMap = new Map();
  let retrievalMode: RetrievalMode = 'limited_broad_fallback';
  let builders: any[] = [];
  let projectsByBuilder = new Map<string, any[]>();
  let allProjects: any[] = [];

  const channels = buildRetrievalChannels({ opportunity: oppPlain, founderId: identity.founderId });
  const channelLimit = searchMode === 'broad' ? 120 : 80;
  logFounderAgent('search_talent:index_retrieval:start', {
    jobId,
    domainTerms: channels.domainTerms.slice(0, 8),
    mustTerms: channels.mustTerms.slice(0, 8),
    stackTerms: channels.stackTerms.slice(0, 8),
    locationTerms: channels.locationTerms.slice(0, 8),
  });
  try {
    const [domainResult, mustResult, stackResult, locationBuilders] = await Promise.all([
      searchTalentSearchIndex({
        terms: channels.domainTerms.length ? channels.domainTerms : channels.stackTerms,
        limit: channelLimit,
      }),
      searchTalentSearchIndex({
        terms: channels.mustTerms.length ? channels.mustTerms : channels.domainTerms,
        limit: channelLimit,
      }),
      searchTalentSearchIndex({
        terms: channels.stackTerms,
        limit: channelLimit,
      }),
      searchLocationChannel(channels.locationTerms, channelLimit),
    ]);
    const mergedBuilders = mergeChannelBuilders({
      domain: domainResult.builders,
      must: mustResult.builders,
      stack: stackResult.builders,
      location: locationBuilders,
      poolTarget,
    });
    if (mergedBuilders.length > 0) {
      builders = mergedBuilders;
      retrievalMode = 'search_index';
    }
    logFounderAgent('search_talent:index_retrieval:done', {
      jobId,
      retrievalMode,
      domainCount: domainResult.builders.length,
      mustCount: mustResult.builders.length,
      stackCount: stackResult.builders.length,
      locationCount: locationBuilders.length,
      mergedCount: mergedBuilders.length,
      durationMs: Math.max(domainResult.durationMs, mustResult.durationMs, stackResult.durationMs),
    });
  } catch (error) {
    logFounderAgentError('search_talent:index_retrieval:error', error, { jobId });
  }

  if (builders.length > 0) {
    const hydrated = await hydrateSearchableBuilderPool({
      seedBuilders: builders,
      targetPoolSize: poolTarget,
      BuilderProfile,
      ProjectRecord,
      allowSupplemental: false,
    });
    builders = hydrated.builders;
    projectsByBuilder = hydrated.projectsByBuilder;
    allProjects = hydrated.allProjects;
    logFounderAgent('search_talent:index_hydrate:done', {
      jobId,
      hydratedBuilderCount: builders.length,
      poolTarget,
    });
  }

  {
    const retrievalStartedAt = Date.now();
    let retrievedBuilderIds: string[] = builders.map((builder: any) => String(builder._id));
    logFounderAgent('search_talent:semantic_retrieval:start', {
      jobId,
      primaryQuery: strategy.primaryQuery,
      expandedQueries: strategy.expandedQueries.slice(0, 2),
    });
    try {
      const semantic = await Promise.race([
        retrieveSemanticBuilderCandidates({
          queries: [
            strategy.primaryQuery,
            ...strategy.expandedQueries.slice(0, 2),
            ...openRequirements.map((requirement) => requirement.text),
            ...getPlanRetrievalTerms(oppPlain.searchPlan).slice(0, 6),
          ],
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
              profileHitCount: 0,
              projectHitCount: 0,
              usedQuery: strategy.primaryQuery,
            }),
            2000
          )
        ),
      ]);
      semanticScores = semantic.scores;
      retrievedBuilderIds = [...new Set([...retrievedBuilderIds, ...semantic.builderIds])];
      if (semantic.builderIds.length > 0) {
        retrievalMode = retrievalMode === 'search_index' ? 'hybrid' : 'semantic';
      }
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

    if (builders.length < poolTarget) {
      const hydrated = await hydrateSearchableBuilderPool({
        seedBuilders: builders,
        targetPoolSize: poolTarget,
        BuilderProfile,
        ProjectRecord,
        allowSupplemental: false,
      });
      builders = hydrated.builders;
      projectsByBuilder = hydrated.projectsByBuilder;
      allProjects = hydrated.allProjects;
      logFounderAgent('search_talent:fallback_hydrate:done', {
        jobId,
        hydratedBuilderCount: builders.length,
        poolTarget,
      });
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

  const builderIdsForWrapped = builders.map((b: any) => b._id);
  const wrappedDocs = builderIdsForWrapped.length
    ? await AgentWrappedReportModel.find({
        builderId: { $in: builderIdsForWrapped },
        source: 'uploaded_agent_usage',
      })
        .select('builderId report.score')
        .sort({ createdAt: -1 })
        .lean()
    : [];
  const wrappedByBuilder = new Map<string, { report?: any; score?: number | null }>();
  for (const doc of wrappedDocs) {
    const key = String(doc.builderId);
    if (!wrappedByBuilder.has(key)) {
      wrappedByBuilder.set(key, {
        report: doc.report,
        score: typeof doc.report?.score === 'number' ? doc.report.score : null,
      });
    }
  }

  const result = await runFounderDiscoveryPipeline({
    opportunity: oppPlain,
    founderId: identity.founderId,
    builders,
    projectsByBuilder,
    wrappedByBuilder,
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
    enableLlmRerank: openRequirements.length > 0 && hasOpenRouterConfig(),
    generateReply: openRequirements.length > 0 && hasOpenRouterConfig()
      ? (systemPrompt, userPrompt) =>
          generateOpenRouterReply({
            model: 'reasoning',
            systemPrompt,
            userPrompt,
            temperature: 0,
            maxTokens: 4500,
          })
      : undefined,
    semanticScores,
    skipSemanticScoring: retrievalMode === 'search_index' || Boolean(semanticScores.size),
    limit: candidateResultLimit,
    excludeBuilderIds: await (async () => {
      const prior = await collectFailingPriorBuilderIds(jobId, oppPlain);
      const hiddenDoc = (await Shortlist.findOne({ opportunityId: jobId }).select('hiddenBuilderIds').lean()) as {
        hiddenBuilderIds?: unknown[];
      } | null;
      const hidden = Array.isArray(hiddenDoc?.hiddenBuilderIds) ? hiddenDoc!.hiddenBuilderIds.map(String) : [];
      return Array.from(new Set([...prior, ...jobExcludedBuilderIds(oppPlain), ...hidden]));
    })(),
    persistGithubActivity: async (builderId, snapshot) => {
      await BuilderProfile.updateOne(
        { _id: builderId },
        {
          $set: {
            'integrations.github.activityScore': snapshot.score,
            'integrations.github.activityFetchedAt': new Date(snapshot.fetchedAt),
            'integrations.github.activitySnapshot': snapshot,
            ...(snapshot.username ? { 'integrations.github.username': snapshot.username } : {}),
          },
        }
      );
    },
  });
  const limitedCandidates = applyCandidateLimit(result.candidates, entitlements);
  const limitedResult = {
    ...result,
    candidates: limitedCandidates,
    searchQuality: {
      ...result.searchQuality,
      strongCandidates: limitedCandidates.filter((candidate) => candidate.matchLabel === 'Strong Match').length,
    },
  };
  const poolSummary = buildPoolSummary(limitedResult, oppPlain);
  const poolNarrative = await buildFounderPoolNarrative(poolSummary);
  logFounderAgent('search_talent:discovery:done', {
    jobId,
    retrievalMode,
    candidateCount: limitedResult.candidates.length,
    strongCount: limitedResult.searchQuality.strongCandidates,
    totalScanned: result.totalScanned,
    topCandidates: limitedResult.candidates.slice(0, 5).map((candidate) => ({
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

  logFounderAgent('search_talent:persist:start', { jobId, candidateCount: limitedResult.candidates.length });
  const { shortlistDoc } = await persistDiscoveryCandidates({
    result: limitedResult,
    opportunityId: String(job._id),
    opportunity: oppPlain,
    founderEmail: identity.email,
    entitlements,
    poolSummary,
    poolNarrative,
  });

  job.status = 'shortlisted';
  job.lastSearchAt = new Date();
  job.entitlementSnapshot = entitlementSnapshot(entitlements);
  job.profileLimitApplied = entitlements.profileLimitPerRole;
  job.managedByDevLabs = entitlements.managedHiring;
  await job.save();
  await recordUsageEvent({
    identity,
    eventType: 'search_run',
    opportunityId: String(job._id),
    planAtEvent: entitlements.plan,
    quantity: limitedResult.candidates.length,
    metadata: {
      searchMode,
      retrievalMode,
      scannedBuilders: result.totalScanned,
      uncappedCandidateCount: result.candidates.length,
    },
  });

  const publicShortlist = toPublicShortlist(shortlistDoc);
  const durationMs = Date.now() - startedAt;
  logFounderAgent('search_talent:done', {
    jobId,
    totalFound: limitedResult.candidates.length,
    strongCount: limitedResult.searchQuality.strongCandidates,
    durationMs,
  });
  notifyOps({
    event: 'search_run',
    title: `New Role Search ${opsPersonFrom(identity.founderName, identity.email)}`,
  });
  return {
    skipped: false,
    totalFound: limitedResult.candidates.length,
    strongCount: limitedResult.searchQuality.strongCandidates,
    retrievalMode,
    scannedBuilders: result.totalScanned,
    shortlist: publicShortlist,
    uiBlock: buildTalentPreviewUiBlock(shortlistDoc, oppPlain),
    sponsorshipCoverage: result.sponsorshipCoverage || null,
    githubActivityUsed: Boolean(result.githubActivityUsed),
    poolSummary,
    poolNarrative,
    noRelevantMatches: Boolean((result as any).noRelevantMatches || limitedResult.candidates.length === 0),
  };
}

async function toolCreateJob(identity: FounderIdentity, session: any, args: Record<string, unknown>, userText: string, company: any) {
  const roleAccess = await canCreateRole(identity);
  if (!roleAccess.ok) {
    return {
      error: roleAccess.message,
      code: roleAccess.code,
      upgradeTarget: roleAccess.upgradeTarget,
      entitlements: entitlementSnapshot(roleAccess.entitlements),
      usage: roleAccess.usage,
    };
  }
  const { entitlements } = roleAccess;
  const title = cleanString(args.title) || cleanString(args.roleTitle);
  let description = cleanString(args.description) || cleanString(args.builderWillDo);
  const skills = cleanList(args.skillsNeeded);
  const salary = cleanString(args.salary) || cleanString(args.budget) || cleanString(args.compensation);
  const companyName = cleanString(args.companyName) || company?.name || cleanString(args.company);
  const searchRequirements = mergeSearchRequirements(
    normalizeSearchRequirements(args.searchRequirements),
    normalizeSearchRequirements(args.requirements)
  );
  const metadata = session.metadata || {};
  const equityState = resolveEquity(args, userText, metadata);
  const visaState = resolveVisa(args, userText, metadata);
  if (!description) {
    description = inferBuilderWillDoFromFounderText(userText, company);
  }
  if (!description && session?._id) {
    const recentFounderMessages = await FounderChatMessage.find({
      sessionId: session._id,
      role: 'founder',
    })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();
    description = inferBuilderWillDoFromMessages([...recentFounderMessages].reverse(), company);
  }
  const missing = [
    title ? null : 'role/title',
    description ? null : 'what the builder will ship',
    skills.length ? null : 'skills',
    companyName ? null : 'company',
  ].filter(Boolean) as string[];
  const compensationMissing = [
    salary ? null : 'salary/compensation',
    visaState.confirmed ? null : 'visa sponsorship confirmation',
    equityState.confirmed ? null : 'equity confirmation',
  ].filter(Boolean) as string[];

  if (missing.length) {
    session.metadata = {
      ...metadata,
      createJobFollowupAsked: true,
      createJobMissingFields: missing,
    };
    await session.save();
    return {
      needsFollowup: true,
      message: createJobMissingMessage(missing),
      missing,
    };
  }

  if (compensationMissing.length) {
    session.metadata = {
      ...metadata,
      createJobCompensationFollowupAsked: true,
      defaultEquityConfirmationAsked: compensationMissing.includes('equity confirmation') || metadata.defaultEquityConfirmationAsked,
      defaultVisaConfirmationAsked: compensationMissing.includes('visa sponsorship confirmation') || metadata.defaultVisaConfirmationAsked,
      defaultCompensationConfirmationAsked: compensationMissing.includes('visa sponsorship confirmation') || compensationMissing.includes('equity confirmation') || metadata.defaultCompensationConfirmationAsked,
      createJobMissingFields: compensationMissing,
    };
    await session.save();
    return {
      needsFollowup: true,
      message: createJobCompensationMessage(compensationMissing),
      missing: compensationMissing,
    };
  }

  if (!searchRequirements.length && !founderExplicitlySkippedPreferences(userText)) {
    session.metadata = {
      ...metadata,
      createJobFollowupAsked: true,
      createJobPreferenceFollowupAsked: true,
    };
    await session.save();
    return {
      needsFollowup: true,
      message: createJobPreferencesMessage(title || '', description || ''),
      missing: ['proof/preferences'],
    };
  }

  const finalTitle = title!;
  const finalDescription = description!;
  const finalCompany = companyName!;
  const responsibilities = cleanList(args.responsibilities).length
    ? cleanList(args.responsibilities)
    : await inferResponsibilitiesForJob({
        title: finalTitle,
        description: finalDescription,
        companyName: finalCompany,
        company,
        skills,
      });
  const shaped = await shapeJobForTalentPool({
    title: finalTitle,
    description: finalDescription,
    builderWillDo: finalDescription,
    skillsNeeded: skills,
    requirements: [
      ...cleanList(args.requirements),
      ...searchRequirements.map((requirement) => requirement.text),
    ],
    responsibilities,
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
    searchRequirements,
    responsibilities,
    deliverables: responsibilities,
    salary,
    budget: salary,
    equity: equityState.equity,
    equityConfirmed: equityState.confirmed,
    visa: visaState.visa,
    visaConfirmed: visaState.confirmed,
    jobType: cleanString(args.jobType),
    workType: cleanString(args.jobType),
    roleType: cleanString(args.jobType) ? [cleanString(args.jobType)] : [],
    workMode: cleanString(args.workMode),
    location: cleanString(args.location),
    locationPreference: cleanString(args.workMode) || cleanString(args.location),
    niceToHaveSkills: shaped.niceToHaveSkills,
    poolFitMetadata: shaped.poolFitMetadata,
    billingPeriodKey: currentPeriodKey(),
    planAtCreation: entitlements.plan,
    entitlementSnapshot: entitlementSnapshot(entitlements),
    profileLimitApplied: entitlements.profileLimitPerRole,
    managedByDevLabs: entitlements.managedHiring,
    status: 'draft',
  });

  await recordUsageEvent({
    identity,
    eventType: 'role_created',
    opportunityId: String(job._id),
    planAtEvent: entitlements.plan,
    metadata: { source: 'founder_agent_chat' },
  });

  notifyOps({
    event: 'role_created',
    title: `New Role Search ${opsPersonFrom(identity.founderName, identity.email)}`,
  });

  session.jobId = job._id;
  session.title = finalTitle;
  session.metadata = {
    ...metadata,
    createJobFollowupAsked: false,
    createJobMissingFields: [],
    createJobPreferenceFollowupAsked: false,
    createJobCompensationFollowupAsked: false,
    defaultEquityConfirmationAsked: false,
    defaultVisaConfirmationAsked: false,
    defaultCompensationConfirmationAsked: false,
    defaultEquityConfirmed: equityState.confirmed && equityState.equity === DEFAULT_EQUITY,
    defaultVisaConfirmed: visaState.confirmed && visaState.visa === DEFAULT_VISA_SPONSORSHIP,
  };
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

async function toolEditJob(identity: FounderIdentity, args: Record<string, unknown>, session: any, userText = '') {
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
  // Accumulate preferences/requirements across turns instead of replacing them, so each
  // new must-have (e.g. "worked at AWS") sharpens the search rather than wiping the
  // earlier ones. Otherwise every edit re-runs the search against the same thin signal.
  const newSearchRequirements = mergeSearchRequirements(
    normalizeSearchRequirements(mergedArgs.searchRequirements),
    normalizeSearchRequirements(mergedArgs.requirements)
  );
  if (newSearchRequirements.length) {
    fields.searchRequirements = mergeSearchRequirements(
      normalizeSearchRequirements(job.searchRequirements),
      newSearchRequirements
    );
    fields.searchPlan = null;
  }
  const requirements = cleanList(mergedArgs.requirements);
  if (requirements.length) {
    const existingRequirements = cleanList(job.requirements);
    fields.requirements = Array.from(new Set([...existingRequirements, ...requirements])).slice(0, 20);
  }
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
  const equityState = resolveEquity(mergedArgs, userText, session?.metadata || {});
  if (cleanString(mergedArgs.equity) || cleanString(mergedArgs.equityOffered)) {
    fields.equity = equityState.equity;
    fields.equityConfirmed = equityState.confirmed;
  } else if ((session?.metadata?.defaultEquityConfirmationAsked || session?.metadata?.defaultCompensationConfirmationAsked) && equityState.confirmed) {
    fields.equity = equityState.equity;
    fields.equityConfirmed = true;
  }
  const visaState = resolveVisa(mergedArgs, userText, session?.metadata || {});
  if (cleanString(mergedArgs.visa) || cleanString(mergedArgs.visaType) || cleanString(mergedArgs.sponsorship) || cleanString(mergedArgs.visaSponsorship)) {
    fields.visa = visaState.visa;
    fields.visaConfirmed = visaState.confirmed;
  } else if ((session?.metadata?.defaultVisaConfirmationAsked || session?.metadata?.defaultCompensationConfirmationAsked) && visaState.confirmed) {
    fields.visa = visaState.visa;
    fields.visaConfirmed = true;
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
  if ((!job.responsibilities || !job.responsibilities.length) && (!job.deliverables || !job.deliverables.length)) {
    const inferredResponsibilities = await inferResponsibilitiesForJob({
      title: job.title || job.roleTitle,
      description: job.description || job.builderWillDo,
      companyName: job.company,
      company: job,
      skills: job.skillsNeeded || [],
    });
    job.responsibilities = inferredResponsibilities;
    job.deliverables = inferredResponsibilities;
  }
  const shaped = await shapeJobForTalentPool({
    title: fields.title as string || job.title || job.roleTitle,
    description: fields.description as string || job.description,
    builderWillDo: fields.builderWillDo as string || job.builderWillDo,
    skillsNeeded: (fields.skillsNeeded as string[]) || job.skillsNeeded || [],
    niceToHaveSkills: (fields.niceToHaveSkills as string[]) || job.niceToHaveSkills || [],
    requirements: [
      ...((fields.requirements as string[]) || job.requirements || []),
      ...searchRequirementTexts((fields.searchRequirements as SearchRequirement[]) || job.searchRequirements || []),
    ],
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
    if (fields.equityConfirmed || fields.visaConfirmed) {
      session.metadata = {
        ...(session.metadata || {}),
        defaultEquityConfirmationAsked: fields.equityConfirmed ? false : session.metadata?.defaultEquityConfirmationAsked,
        defaultVisaConfirmationAsked: fields.visaConfirmed ? false : session.metadata?.defaultVisaConfirmationAsked,
        defaultCompensationConfirmationAsked: fields.equityConfirmed && fields.visaConfirmed ? false : session.metadata?.defaultCompensationConfirmationAsked,
        defaultEquityConfirmed: fields.equityConfirmed ? fields.equity === DEFAULT_EQUITY : session.metadata?.defaultEquityConfirmed,
        defaultVisaConfirmed: fields.visaConfirmed ? fields.visa === DEFAULT_VISA_SPONSORSHIP : session.metadata?.defaultVisaConfirmed,
      };
    }
    await session.save();
  }

  // Only auto-rerun the search when the brief is already solid. On a thin/pre-created
  // role (e.g. the founder just changed the title), persist the edit but keep gathering
  // detail instead of dumping match results before we've asked the real questions.
  if (isJobBriefThin(job)) {
    // Still refilter an existing shortlist when visa flips to No (Diya-class bug).
    if (fields.visa === 'No' || (fields.visaConfirmed && opportunityDoesNotSponsor(job))) {
      const refresh = (await toolRefreshShortlist(
        identity,
        { jobId: String(job._id), rerunSearchIfEmpty: false },
        session,
        userText
      )) as Record<string, any>;
      return {
        job: serializeJob(job),
        updatedFields: Object.keys(fields),
        search: { skipped: true, reason: 'Role brief is still thin; gather more detail before searching.' },
        searchSkippedThin: true,
        shortlistChanged: Boolean(refresh.shortlistChanged),
        refresh,
        message: refresh.shortlistChanged
          ? `${refresh.message || 'Filtered the pool.'} Keep gathering the brief before a full search.`
          : 'Updated the role. Keep gathering the brief (description, then experience and preferences) before searching.',
      };
    }
    return {
      job: serializeJob(job),
      updatedFields: Object.keys(fields),
      search: { skipped: true, reason: 'Role brief is still thin; gather more detail before searching.' },
      searchSkippedThin: true,
      message: 'Updated the role. Keep gathering the brief (description, then experience and preferences) before searching.',
    };
  }

  // Visa flipped to No: hard-refilter the pool before/alongside search so sponsorship
  // mismatches never linger in the Recommended pane.
  if (fields.visa === 'No' || (fields.visaConfirmed && opportunityDoesNotSponsor(job))) {
    const refresh = (await toolRefreshShortlist(
      identity,
      { jobId: String(job._id), rerunSearchIfEmpty: false },
      session,
      userText
    )) as Record<string, any>;
    const search = await runSearchForJob(identity, job, 'balanced', { force: true });
    const removed = Array.isArray(refresh.removed) ? refresh.removed : [];
    return {
      job: serializeJob(job),
      updatedFields: Object.keys(fields),
      search,
      refresh,
      shortlistChanged: true,
      message: search.skipped
        ? 'Updated the job. Search needs a bit more detail before I rerun it.'
        : searchResultMessage(
            search,
            removed.length
              ? `Updated the role, removed ${removed.map((r: any) => r.name || r.builderId).join(', ')} who need sponsorship, and refreshed builders.`
              : 'Got it, updated the role and refreshed builders.'
          ),
    };
  }

  const search = await runSearchForJob(identity, job, 'balanced', { force: true });
  return {
    job: serializeJob(job),
    updatedFields: Object.keys(fields),
    search,
    shortlistChanged: !search.skipped,
    message: search.skipped
      ? 'Updated the job. Search needs a bit more detail before I rerun it.'
      : searchResultMessage(search, 'Got it, updated the role.'),
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

async function toolSearchTalent(identity: FounderIdentity, args: Record<string, unknown>, session: any, userText = '') {
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

  // If the founder just confirmed the visa/equity defaults, persist that here so we don't
  // loop on the same compensation question when the agent calls search_talent directly.
  const metadata = session?.metadata || {};
  let confirmationPersisted = false;
  if (job.equityConfirmed !== true) {
    const equityState = resolveEquity(args, userText, metadata);
    if (equityState.confirmed) {
      job.equity = job.equity || equityState.equity;
      job.equityConfirmed = true;
      confirmationPersisted = true;
    }
  }
  if (job.visaConfirmed !== true) {
    const visaState = resolveVisa(args, userText, metadata);
    if (visaState.confirmed) {
      job.visa = job.visa || visaState.visa;
      job.visaConfirmed = true;
      confirmationPersisted = true;
    }
  }
  if (confirmationPersisted) await job.save();

  const compensationMissing = missingCompensationFields(job);
  if (compensationMissing.length) {
    if (session) {
      session.metadata = {
        ...(session.metadata || {}),
        createJobCompensationFollowupAsked: true,
        defaultEquityConfirmationAsked: compensationMissing.includes('equity confirmation') || session.metadata?.defaultEquityConfirmationAsked,
        defaultVisaConfirmationAsked: compensationMissing.includes('visa sponsorship confirmation') || session.metadata?.defaultVisaConfirmationAsked,
        defaultCompensationConfirmationAsked: compensationMissing.includes('visa sponsorship confirmation') || compensationMissing.includes('equity confirmation') || session.metadata?.defaultCompensationConfirmationAsked,
        createJobMissingFields: compensationMissing,
      };
      await session.save();
    }
    return {
      needsFollowup: true,
      missing: compensationMissing,
      job: serializeJob(job),
      message: createJobCompensationMessage(compensationMissing),
    };
  }

  if ((!job.responsibilities || !job.responsibilities.length) && (!job.deliverables || !job.deliverables.length)) {
    const inferredResponsibilities = await inferResponsibilitiesForJob({
      title: job.title || job.roleTitle,
      description: job.description || job.builderWillDo,
      companyName: job.company,
      company: job,
      skills: job.skillsNeeded || [],
    });
    job.responsibilities = inferredResponsibilities;
    job.deliverables = inferredResponsibilities;
    await job.save();
  }

  const rawMode = cleanString(args.searchMode);
  const searchMode: SearchMode = rawMode === 'broad' || rawMode === 'strict' ? rawMode : 'balanced';
  // Explicit search requests always re-run fresh rather than returning a cached shortlist.
  const search = await runSearchForJob(identity, job, searchMode, { force: true });

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
      : searchResultMessage(search),
  };
}

async function toolInspectTalentPool(
  identity: FounderIdentity,
  args: Record<string, unknown>,
  session: any
): Promise<Record<string, unknown>> {
  const jobId = cleanString(args.jobId) || (session?.jobId ? String(session.jobId) : null);
  if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) return { error: 'A valid current role is required.' };

  const job = await JobPosting.findOne({ _id: jobId, founderEmail: identity.email })
    .select('title roleTitle skillsNeeded searchRequirements visa location locationPreference workMode searchPlan')
    .lean();
  if (!job) return { error: 'Role not found.' };

  const shortlist = await Shortlist.findOne({ opportunityId: jobId, founderEmail: identity.email })
    .select('candidates')
    .lean();
  const shortlistIds = Array.isArray((shortlist as any)?.candidates)
    ? (shortlist as any).candidates.map((candidate: any) => String(candidate.builderId)).filter(Boolean)
    : [];
  if (!shortlistIds.length) {
    return { error: 'No current shortlist exists. Run a talent search first.' };
  }

  const requestedIds = Array.isArray(args.builderIds)
    ? args.builderIds.map((id) => String(id)).filter((id) => shortlistIds.includes(id))
    : shortlistIds;
  const candidateIds = requestedIds.slice(0, 35);
  const builders = await BuilderProfile.find({
    _id: { $in: candidateIds },
    ...searchableBuilderFilter(),
  })
    .select(BUILDER_SEARCH_SELECT)
    .maxTimeMS(10000)
    .lean();
  const projects = await ProjectRecord.find({ builderId: { $in: builders.map((builder: any) => builder._id) } })
    .select('builderId projectName description problemSolved techStack builderContribution verificationStatus links')
    .sort({ updatedAt: -1 })
    .limit(280)
    .maxTimeMS(10000)
    .lean();
  const projectsByBuilder = new Map<string, any[]>();
  for (const project of projects) {
    const key = String(project.builderId);
    const list = projectsByBuilder.get(key) || [];
    list.push(project);
    projectsByBuilder.set(key, list);
  }

  const fields = new Set(
    Array.isArray(args.fields) && args.fields.length
      ? args.fields.map((field) => String(field))
      : ['profile', 'projects', 'experience', 'github_activity', 'sponsorship', 'public_presence', 'ranking_evidence']
  );
  const sourceCandidate = new Map<string, any>(
    ((shortlist as any).candidates || []).map((candidate: any) => [String(candidate.builderId), candidate])
  );
  const evidence = builders.map((builder: any) => {
    const builderId = String(builder._id);
    const shortlisted = sourceCandidate.get(builderId);
    const record: Record<string, unknown> = {
      builderId,
      name: builder.name,
      location: resolveBuilderBaseLocation(builder).text || builder.location || null,
      matchScore: shortlisted?.matchScore ?? null,
      matchLabel: shortlisted?.matchLabel ?? null,
    };
    if (fields.has('profile')) {
      record.profile = {
        headline: builder.headline || null,
        skills: (builder.rolePreference || builder.skills || []).slice(0, 12),
        location: resolveBuilderBaseLocation(builder).text || builder.location || null,
      };
    }
    if (fields.has('projects')) {
      record.projects = (projectsByBuilder.get(builderId) || []).slice(0, 5).map((project: any) => ({
        name: project.projectName,
        description: String(project.description || '').slice(0, 360),
        techStack: (project.techStack || []).slice(0, 10),
        contribution: String(project.builderContribution || '').slice(0, 280),
        verificationStatus: project.verificationStatus || null,
        hasGithub: Boolean(project.links?.github),
      }));
    }
    if (fields.has('experience')) {
      record.experience = (builder.experiences || []).slice(0, 5).map((experience: any) => ({
        title: experience.title || null,
        company: experience.company || null,
        location: experience.location || null,
        description: String(experience.description || '').slice(0, 280),
      }));
    }
    if (fields.has('github_activity')) {
      const snapshot = builder.integrations?.github?.activitySnapshot;
      record.githubActivity = snapshot?.source === 'github_api'
        ? {
            score: snapshot.score,
            recentEventCount: snapshot.recentEventCount,
            recentlyPushedRepos: snapshot.recentlyPushedRepos,
            publicRepos: snapshot.publicRepos,
          }
        : { available: false };
    }
    if (fields.has('sponsorship')) {
      const inference = inferSponsorshipNeed(builder);
      record.sponsorship = {
        need: inference.need,
        confidence: inference.confidence,
        evidence: inference.evidence,
      };
    }
    if (fields.has('public_presence')) {
      record.publicPresence = (builder.enrichmentInsights?.founderHighlights || [])
        .filter((highlight: any) => /twitter|x\/|public|post|writing|talk|community/i.test(
          `${highlight?.title || ''} ${highlight?.detail || ''} ${highlight?.source || ''}`
        ))
        .slice(0, 5)
        .map((highlight: any) => ({
          title: highlight.title,
          detail: highlight.detail,
          source: highlight.source,
        }));
    }
    if (fields.has('ranking_evidence')) {
      record.rankingEvidence = {
        whyTheyMatch: shortlisted?.whyTheyMatch || null,
        requirements: shortlisted?.requirementFindings || [],
      };
    }
    return record;
  });

  return {
    job: { id: String((job as any)._id), title: (job as any).title || (job as any).roleTitle, skills: (job as any).skillsNeeded || [] },
    question: cleanString(args.question) || null,
    cohort: { available: shortlistIds.length, inspected: evidence.length, maxInspectable: 35 },
    locationMix: summarizeShortlistLocations(builders, job),
    evidence,
    dataBoundary: 'Read-only role-scoped builder/profile/project evidence. Missing evidence is unknown, not negative.',
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
        result = await toolEditJob(identity, args, session, userText);
        break;
      case 'search_talent':
        result = await toolSearchTalent(identity, args, session, userText);
        break;
      case 'inspect_talent_pool':
        result = await toolInspectTalentPool(identity, args, session);
        break;
      case 'list_shortlist':
        result = await toolListShortlist(identity, args, session);
        break;
      case 'remove_builders':
        result = await toolRemoveBuilders(identity, args, session);
        break;
      case 'keep_builders':
        result = await toolKeepBuilders(identity, args, session);
        break;
      case 'exclude_builders':
        result = await toolExcludeBuilders(identity, args, session);
        break;
      case 'refresh_shortlist':
        result = await toolRefreshShortlist(identity, args, session, userText);
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
  const founderProfile = await getFounderProfileDoc(params.identity);
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

  const inferredBuilderWillDo = inferBuilderWillDoFromMessages(historyDocs, company);
  const existingShortlist = session.jobId
    ? await Shortlist.findOne({ opportunityId: session.jobId }).select('totalMatches candidates').lean()
    : null;
  const hasSearchResults = Boolean(
    existingShortlist &&
      ((existingShortlist as any).totalMatches > 0 ||
        (Array.isArray((existingShortlist as any).candidates) && (existingShortlist as any).candidates.length > 0))
  );
  const conversationAgenda = buildConversationAgenda({
    founderProfile,
    company,
    job: currentJob,
    historyLength: historyDocs.filter((m: any) => m.role === 'founder' || m.role === 'assistant').length,
    hasSearchResults,
  });
  const roleReadiness = currentJob
    ? (() => {
        const description = String(currentJob.description || currentJob.builderWillDo || '').trim();
        const skills = Array.isArray(currentJob.skillsNeeded) ? currentJob.skillsNeeded : [];
        const niceToHaves = Array.isArray(currentJob.niceToHaveSkills) ? currentJob.niceToHaveSkills : [];
        const preferences = Array.isArray(currentJob.searchRequirements) ? currentJob.searchRequirements : [];
        const hasDescription = description.length > 40 || Boolean(conversationAgenda.productSnippet);
        const hasPreferences = preferences.length > 0;
        const isThin = isJobBriefThin(currentJob);
        return {
          hasDescription,
          hasPreferences,
          hasNiceToHaves: niceToHaves.length > 0,
          skillCount: skills.length,
          skillsBloated: skills.length > 12,
          isThin,
          guidance: isThin
            ? 'This role is still thin (likely pre-created from quick intake). Follow conversationAgenda.nextQuestionHint. Persist each answer with edit_job.'
            : 'This role has a solid brief. Once the founder is ready, run search_talent.',
        };
      })()
    : null;
  const enriched = compactFounderContext(founderProfile, company);
  const context = {
    founder: {
      id: params.identity.founderId,
      name: params.identity.founderName,
      email: params.identity.email,
      ...(enriched.founder || {}),
    },
    company: enriched.company,
    currentJob: serializeJob(currentJob),
    roleReadiness,
    conversationAgenda,
    skillDumpDetected: looksLikeSkillDump(params.message),
    session: serializeSession(session),
    conversationSignals: {
      builderWillDo: inferredBuilderWillDo,
      guidance: inferredBuilderWillDo
        ? 'The founder has already described what the builder should work on. Reuse this instead of asking what they will do.'
        : conversationAgenda.nextQuestionHint,
    },
  };

  const messages: AgentMessage[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nContext JSON:\n${JSON.stringify(context)}` },
    ...historyDocs.slice(-20).map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: m.content,
    })),
  ];
  const modelRoute = shouldUseReasoningModel(params.message) ? 'reasoning' as const : 'chat' as const;

  let agentResponse = await generateOpenRouterAgentTurn({
    messages,
    tools: TOOLS,
    temperature: 0.25,
    maxTokens: modelRoute === 'reasoning' ? 1600 : 1200,
    model: modelRoute,
  });
  logFounderAgent('chat:model_response', {
    sessionId: String(session._id),
    model: modelRoute === 'reasoning' ? getOpenRouterReasoningModel() : getOpenRouterChatModel(),
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
        maxTokens: modelRoute === 'reasoning' ? 1600 : 1200,
        model: modelRoute,
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

  const poolNarrative = toolCalls
    .map((tool) => (tool.result as any)?.search?.poolNarrative || (tool.result as any)?.search?.poolNarrative)
    .find((value) => typeof value === 'string' && value.trim());
  const toolMessage = toolCalls
    .map((tool) => (tool.result as any)?.message)
    .filter((value) => typeof value === 'string' && value.trim())
    .at(-1);
  const finalMessage =
    (typeof agentResponse.content === 'string' && agentResponse.content.trim()
      ? agentResponse.content.trim()
      : null) ||
    poolNarrative ||
    toolMessage ||
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
    getCompany(params.identity).then((doc) => (doc?.toObject ? doc.toObject() : doc)),
    session.jobId ? JobPosting.findById(session.jobId).lean() : Promise.resolve(null),
    FounderChatMessage.find({ sessionId: session._id, role: { $in: ['founder', 'assistant'] } })
      .sort({ createdAt: 1 })
      .limit(80)
      .lean(),
  ]);

  // A search actually ran (via search_talent OR a job edit that reran search) and produced
  // results — used by the UI to switch to the builders pane.
  const searchRan = toolCalls.some((tool) => {
    const result = tool.result as any;
    if (!result || result.error || result.needsFollowup) return false;
    return Boolean(result.search) && result.search.skipped !== true;
  });
  const shortlistChanged = toolCalls.some((tool) => {
    const result = tool.result as any;
    if (!result || result.error) return false;
    return (
      result.shortlistChanged === true ||
      ['remove_builders', 'keep_builders', 'exclude_builders', 'refresh_shortlist', 'search_talent'].includes(tool.name)
    );
  });
  const searchNeedsFollowup = toolCalls.some((tool) => (tool.result as any)?.needsFollowup);

  const response = {
    message: String(finalMessage),
    session: serializeSession(freshSession),
    job: serializeJob(freshJob),
    company: serializeCompany(freshCompany),
    history: freshMessages.map(serializeMessage),
    toolCalls,
    searchRan,
    shortlistChanged: shortlistChanged || searchRan,
    searchNeedsFollowup,
    meta: {
      model: modelRoute === 'reasoning' ? getOpenRouterReasoningModel() : getOpenRouterChatModel(),
      iterations,
    },
  };
  logFounderAgent('chat:done', {
    sessionId: response.session?.id || String(session._id),
    jobId: response.job?.id || null,
    toolCalls: toolCalls.map((tool) => tool.name),
    model: response.meta.model,
    durationMs: Date.now() - chatStartedAt,
  });
  return response;
}

export async function ensureChatBootstrap(identity: FounderIdentity, session: any, job: any, company: any) {
  const existing = await FounderChatMessage.find({
    sessionId: session._id,
    role: { $in: ['founder', 'assistant'] },
  })
    .limit(1)
    .lean();
  if (existing.length) {
    return { bootstrapped: false as const };
  }

  // Idempotency: mark before generating so concurrent GETs don't double-write.
  if (session.metadata?.bootstrappedAt) {
    return { bootstrapped: false as const };
  }

  const founderProfile = await getFounderProfileDoc(identity);
  const agenda = buildConversationAgenda({
    founderProfile,
    company,
    job,
    historyLength: 0,
    hasSearchResults: false,
  });

  let opener = buildFallbackOpener(agenda);
  if (hasOpenRouterConfig()) {
    try {
      opener = await generateOpenRouterReply({
        model: 'chat',
        temperature: 0.4,
        maxTokens: 180,
        systemPrompt: `You open the DevLabs founder hiring chat. Write ONE short texting-style opener (2-3 sentences max).
Reference the company/product by name when known. Ask only the single next best question from nextQuestionHint.
Never use em-dashes. Never sound like an AI assistant. Do not mention tools or the Recommended pane.
If doNotAsk includes what_will_they_build, do not ask what they will build.`,
        userPrompt: JSON.stringify({
          founderName: identity.founderName,
          agenda,
          company: compactFounderContext(founderProfile, company).company,
          role: job ? { title: job.title || job.roleTitle, skills: job.skillsNeeded, salary: job.salary } : null,
        }),
      });
    } catch (error) {
      logFounderAgentError('bootstrap:opener_failed', error, { sessionId: String(session._id) });
      opener = buildFallbackOpener(agenda);
    }
  }

  await appendMessage({
    identity,
    session,
    role: 'assistant',
    content: opener.trim(),
    jobId: job?._id || session.jobId || null,
  });
  session.metadata = {
    ...(session.metadata || {}),
    bootstrappedAt: new Date().toISOString(),
    bootstrapAgenda: {
      phase: agenda.phase,
      gaps: agenda.gaps,
      nextQuestionHint: agenda.nextQuestionHint,
    },
  };
  await session.save();
  logFounderAgent('bootstrap:done', { sessionId: String(session._id), gaps: agenda.gaps });
  return { bootstrapped: true as const, opener, agenda };
}

export async function getFounderAgentChatState(identity: FounderIdentity, params: { sessionId?: string | null; jobId?: string | null }) {
  await connectAdminDB();
  const session = params.sessionId || params.jobId
    ? await getOrCreateSession(identity, params)
    : null;
  const [company, job] = await Promise.all([
    getCompany(identity),
    session?.jobId ? JobPosting.findById(session.jobId).lean() : Promise.resolve(null),
  ]);

  if (session && job) {
    await ensureChatBootstrap(identity, session, job, company);
  }

  const messages = session
    ? await FounderChatMessage.find({ sessionId: session._id, role: { $in: ['founder', 'assistant'] } })
        .sort({ createdAt: 1 })
        .limit(80)
        .lean()
    : [];

  return {
    session: serializeSession(session),
    company: serializeCompany(company),
    job: serializeJob(job),
    history: messages.map(serializeMessage),
  };
}

/**
 * Pipeline counts for builders on the role shortlist only (non-cumulative stages).
 * Avoids inflating "Recommended" with every match record ever written during search/backfill.
 */
function pipelineCountsForShortlist(
  statusCounts: Record<string, number>,
  shortlist: { candidates?: unknown[]; totalMatches?: number; strongMatchCount?: number } | null | undefined
) {
  const n = (key: string) => statusCounts[key] || 0;
  const shortlistSize = shortlist?.totalMatches ?? (Array.isArray(shortlist?.candidates) ? shortlist.candidates.length : 0);
  const inPipeline =
    n('intro_requested') +
    n('builder_interested') +
    n('interviewing') +
    n('trial') +
    n('offer') +
    n('hired');

  return {
    recommended: Math.max(shortlistSize - inPipeline, n('generated') + n('approved')),
    strongMatches: shortlist?.strongMatchCount ?? 0,
    contacted: n('intro_requested'),
    accepted: n('builder_interested') + n('interviewing'),
    trial: n('trial') + n('offer'),
    hired: n('hired'),
  };
}

function roleStatusPresentation(status: string | null | undefined, hasSearchResults: boolean) {
  const key = String(status || 'draft');
  if (!hasSearchResults) {
    return { label: 'Setting up', tone: 'neutral' as const };
  }
  switch (key) {
    case 'hired':
      return { label: 'Hired', tone: 'success' as const };
    case 'interviewing':
      return { label: 'Interviewing', tone: 'active' as const };
    case 'shortlisted':
      return { label: 'Review builders', tone: 'active' as const };
    case 'matching':
      return { label: 'Sourcing', tone: 'active' as const };
    case 'closed':
      return { label: 'Closed', tone: 'neutral' as const };
    default:
      return { label: 'In progress', tone: 'active' as const };
  }
}

export async function getFounderJobs(identity: FounderIdentity) {
  await connectAdminDB();
  const [jobs, sessions, company, billing, usage] = await Promise.all([
    JobPosting.find({ founderEmail: identity.email, status: { $nin: ['closed'] } })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),
    FounderChatSession.find({ founderId: identity.founderId, status: 'active' })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean(),
    getCompany(identity),
    getFounderEntitlements(identity),
    getFounderUsage(identity),
  ]);

  // Shortlist + pipeline counts scoped to builders the founder actually sees.
  const jobIds = jobs.map((job: any) => job._id);
  const shortlists = jobIds.length
    ? await Shortlist.find({ opportunityId: { $in: jobIds } })
      .select('opportunityId candidates totalMatches strongMatchCount profileLimitApplied previewGeneratedAt')
      .lean()
    : [];
  const shortlistByJob = new Map(shortlists.map((shortlist: any) => [String(shortlist.opportunityId), shortlist]));
  const shortlistBuilderIds = shortlists.flatMap((shortlist: any) =>
    (shortlist.candidates || []).map((candidate: any) => candidate.builderId).filter(Boolean)
  );

  const matchCounts = jobIds.length && shortlistBuilderIds.length
    ? await MatchRecord.aggregate([
        { $match: { opportunityId: { $in: jobIds }, builderId: { $in: shortlistBuilderIds } } },
        { $group: { _id: { opportunityId: '$opportunityId', status: '$status' }, count: { $sum: 1 } } },
      ])
    : [];
  const statusByJob = new Map<string, Record<string, number>>();
  for (const row of matchCounts) {
    const jobId = String(row._id.opportunityId);
    const map = statusByJob.get(jobId) || {};
    map[row._id.status] = row.count;
    statusByJob.set(jobId, map);
  }

  return {
    jobs: jobs.map((job: any) => {
      const shortlist = shortlistByJob.get(String(job._id));
      const hasSearchResults = Boolean(shortlist?.previewGeneratedAt);
      return {
        ...serializeJob(job),
        statusPresentation: roleStatusPresentation(job.status, hasSearchResults),
        recommendationLimit: job.profileLimitApplied ?? shortlist?.profileLimitApplied ?? null,
        strongMatchCount: shortlist?.strongMatchCount ?? 0,
        lastSearchAt: job.lastSearchAt || shortlist?.previewGeneratedAt || null,
        pipeline: pipelineCountsForShortlist(statusByJob.get(String(job._id)) || {}, shortlist),
      };
    }),
    sessions: sessions.map(serializeSession),
    company: serializeCompany(company),
    billing: {
      entitlements: entitlementSnapshot(billing.entitlements),
      account: {
        plan: billing.entitlements.plan,
        status: billing.entitlements.status,
        billingInterval: billing.entitlements.billingInterval,
      },
      usage,
    },
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
  const [billing, usage] = await Promise.all([
    getFounderEntitlements(identity),
    getFounderUsage(identity),
  ]);

  const shortlists = await Promise.all(
    shortlistDocs.map(async (sl: any) => {
      const pub = toPublicShortlist(sl);
      if (!pub) return null;
      const opportunity = oppById.get(String(sl.opportunityId));
      const fullCandidates = await buildFullCandidatesForShortlist(sl, opportunity, {
        BuilderProfile,
        ProjectRecord,
        MatchRecord,
      }, {
        entitlements: billing.entitlements,
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
    billing: {
      entitlements: entitlementSnapshot(billing.entitlements),
      account: {
        plan: billing.entitlements.plan,
        status: billing.entitlements.status,
        billingInterval: billing.entitlements.billingInterval,
      },
      usage,
    },
  };
}
