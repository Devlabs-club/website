import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { runtimeEnvFromLocals, type RuntimeEnv } from '@/lib/workosEnv';
import { generateOpenRouterAgentTurn, generateOpenRouterReply, getOpenRouterChatModel, hasOpenRouterConfig, type AgentMessage, type ToolDefinition } from '@/lib/openrouter';
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

type RetrievalMode = 'cached_shortlist' | 'search_index' | 'semantic' | 'keyword_fallback' | 'limited_broad_fallback';
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
- Keep it short. A sentence or two per message, no walls of text.
- You can send a few short messages in a row to feel human. Separate each one with a blank line and the app shows them as separate texts. Usually 1-2 bubbles, occasionally 3. Don't pad.
- Say things like "Cool, got it" only when it actually adds something.
- Ask one focused follow-up when a required detail is missing. Do not create the job in the same turn as that follow-up.

Rules:
- You have two jobs: conversation and tool use.
- Use chat history and company/job context before asking.
- One chat session maps to one role/job. Do not mix role context across sessions.
- Be proactive: keep the founder moving toward a finished role brief and a builder search. Encourage them to complete the remaining fields, then say something like "let's find you the perfect builder."
- Use create_job only when you have enough detail for: role/title, what the builder will do, required skills/stack, company, salary/compensation, visa sponsorship confirmation, equity confirmation, and the founder's proof/preferences.
- Treat founder phrases like "I want to build a chat interface", "build the dashboard", or "work on the AI agent" as the builderWillDo/description. Do not ask "what will they do" again when the feature/product has already been named.
- If scope is genuinely unclear, ask: "Is this builder focused on a specific feature, or the broader product?" If they say broader product/product in general, use the saved company context to write the job description.
- Before create_job, ask for missing skills/stack, salary/compensation, default visa sponsorship confirmation, default equity confirmation, and proof/preferences like experience level, internships, schools, project evidence, or "no preferences".
- Default compensation policy: visa sponsorship is "Yes" and equity is "No". Confirm both with the founder in chat before creating the job or searching.
- Use create_job and edit_job tool arguments as the structured JSON contract. Do not rely on hidden assumptions for salary, visa, equity, or responsibilities.
- Auto-fill responsibilities from the company context, job description, and role title when the founder does not provide responsibilities. Do not ask for responsibilities just to create a job.
- Keep preferences like "interned at big tech", "went to Stanford or Yale", "built a chat feature", or "strong design sense" as natural-language requirements/searchRequirements. Do not translate them into rigid fields or company lists.
- Use searchRequirements with importance "must" for hard filters and "nice" for preferences. requirements can still be plain text when that is easier.
- If create_job says needsFollowup, ask that follow-up and wait for the founder's answer. Never infer missing required fields just because a follow-up was already asked.
- Use fetch_jobs when the founder asks what jobs/roles exist.
- Use fetch_job when the founder asks about one specific job.
- Use search_talent when the founder asks to find/search/match candidates for the current job.
- Use edit_job when they want to change a job. It reruns search only when the brief is already solid; on a thin/pre-created role it just saves the change so you can keep gathering. After editing a thin role (e.g. a title change), do NOT claim you pulled builders. Ask the next gathering question instead.
- When currentJob exists and the founder answers salary, visa sponsorship, or equity confirmation, use edit_job to persist those fields before calling search_talent.
- Use update_company_info when they change company name, mission, product, website, industry, funding, or location.
- Do not mention tools unless the action matters to the founder.

Your capabilities (know these so you ask the right questions):
- edit_job lets you set: title, description, required skills/stack (skillsNeeded), nice-to-have skills, responsibilities, salary, equity, visa, job type, work mode, location.
- searchRequirements capture founder preferences with importance "must" (hard filter) or "nice" (preference). Specific, concrete requirements directly change who the search surfaces.
- search_talent runs the builder search. It ranks builders by real proof-of-work — their projects, verified skills, and GitHub/demo evidence — against this role's description, skills, and requirements.
- fetch_jobs / fetch_job read roles; update_company_info edits the company profile.
- The search is only as good as the brief. A thin brief returns weak matches. Gather strong, specific signal before you search.

Roles pre-created from quick intake:
- Some roles are created from a fast 3-question intake (role title, stack, compensation) BEFORE this chat opens. They start thin: short or empty description, only a couple of skills, no preferences. Check roleReadiness in the context.
- When the role is thin, do NOT jump straight to search just because compensation is set. First proactively gather, one focused question per turn, persisting each answer with edit_job:
  1. A real job description — what will the builder actually build and own? The product, feature, or problem.
  2. Required experience/seniority and any must-have qualifications.
  3. Preferences that sharpen the search: domain experience, internships/companies, schools, specific project evidence, or an explicit "no preferences". Save these as searchRequirements.
  4. Any nice-to-have skills beyond the core stack.
- Be proactive and thorough on behalf of the founder: ask as many high-signal questions as are genuinely useful to find the best builder, but stop once the brief is solid — don't over-ask.

Starting the search:
- When you tell the founder you'll find/search for a builder (e.g. "let's find you the perfect builder"), you MUST call search_talent in that same turn. Never announce a search without actually running it.
- Only announce and run the search once the brief is solid (real description + skills + at least one round of preferences) and the founder is ready.
- When the founder confirms the visa/equity defaults (e.g. "yes"), persist it with edit_job or just call search_talent. Do not ask the same visa/equity confirmation again once they've answered it.

Talking about search results:
- Never tell the founder there are "no strong matches", "weak matches", or that the results aren't great. Don't grade the results down.
- If there are strong matches, you can say so (e.g. "found a couple of strong matches"). If there aren't, just say you've pulled together some builders for them to look at and keep it positive.
- After a search runs, point them to the builders pane on the right. Don't repeat candidate counts over and over.`;

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
  'universityOrCompany',
  'education',
  'experiences',
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
    ...(Array.isArray(opportunity.searchRequirements)
      ? opportunity.searchRequirements.map((requirement: any) => requirement?.text)
      : []),
    ...(Array.isArray(opportunity.requirements) ? opportunity.requirements : []),
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
  if (/\b(no visa|no sponsorship|without sponsorship|do not sponsor|don't sponsor)\b/.test(normalized)) {
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
 * Founder-facing message after a search runs. Never grades the results negatively
 * or mentions "no strong matches" — surfaces strength only when it's good news.
 */
function searchResultMessage(search: any, prefix = ''): string {
  const total = Number(search?.totalFound || 0);
  const strong = Number(search?.strongCount || 0);
  const head = prefix ? `${prefix} ` : '';
  if (strong > 0) {
    return `${head}I found ${strong} strong ${strong === 1 ? 'match' : 'matches'} for this role. They're in the builders pane on the right.`;
  }
  if (total > 0) {
    return `${head}I pulled together some builders for this role. Take a look in the pane on the right and tell me what stands out.`;
  }
  return `${head}I just ran the search. Let's add a bit more detail to sharpen it. Anything specific on experience or background?`;
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
  const candidateResultLimit = entitlements.profileLimitPerRole ?? 50;
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
      requirements: [
        ...(oppPlain.requirements || []),
        ...searchRequirementTexts(oppPlain.searchRequirements),
      ],
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

  const strategy = buildSearchStrategy({ opportunity: oppPlain, founderId: identity.founderId, searchMode });
  const openRequirements = normalizeSearchRequirements(oppPlain.searchRequirements).length
    ? normalizeSearchRequirements(oppPlain.searchRequirements)
    : normalizeSearchRequirements(oppPlain.requirements);
  let semanticScores: SemanticScoreMap = new Map();
  let retrievalMode: RetrievalMode = 'limited_broad_fallback';
  let builders: any[] = [];
  let projectsByBuilder = new Map<string, any[]>();
  let allProjects: any[] = [];

  const indexTerms = [
    strategy.primaryQuery,
    ...strategy.expandedQueries,
    ...openRequirements.map((requirement) => requirement.text),
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
          queries: [
            strategy.primaryQuery,
            ...strategy.expandedQueries.slice(0, 2),
            ...openRequirements.map((requirement) => requirement.text),
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
    enableLlmRerank: openRequirements.length > 0 && hasOpenRouterConfig(),
    generateReply: openRequirements.length > 0 && hasOpenRouterConfig()
      ? (systemPrompt, userPrompt) =>
          generateOpenRouterReply({ systemPrompt, userPrompt, temperature: 0, maxTokens: 900 })
      : undefined,
    semanticScores,
    limit: candidateResultLimit,
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
    founderEmail: identity.email,
    entitlements,
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
  logFounderAgent('search_talent:done', {
    jobId,
    totalFound: limitedResult.candidates.length,
    strongCount: limitedResult.searchQuality.strongCandidates,
    durationMs: Date.now() - startedAt,
  });
  return {
    skipped: false,
    totalFound: limitedResult.candidates.length,
    strongCount: limitedResult.searchQuality.strongCandidates,
    retrievalMode,
    scannedBuilders: result.totalScanned,
    shortlist: publicShortlist,
    uiBlock: buildTalentPreviewUiBlock(shortlistDoc, oppPlain),
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
    return {
      job: serializeJob(job),
      updatedFields: Object.keys(fields),
      search: { skipped: true, reason: 'Role brief is still thin; gather more detail before searching.' },
      searchSkippedThin: true,
      message: 'Updated the role. Keep gathering the brief (description, then experience and preferences) before searching.',
    };
  }

  const search = await runSearchForJob(identity, job, 'balanced', { force: true });
  return {
    job: serializeJob(job),
    updatedFields: Object.keys(fields),
    search,
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

  const inferredBuilderWillDo = inferBuilderWillDoFromMessages(historyDocs, company);
  const roleReadiness = currentJob
    ? (() => {
        const description = String(currentJob.description || currentJob.builderWillDo || '').trim();
        const skills = Array.isArray(currentJob.skillsNeeded) ? currentJob.skillsNeeded : [];
        const niceToHaves = Array.isArray(currentJob.niceToHaveSkills) ? currentJob.niceToHaveSkills : [];
        const preferences = Array.isArray(currentJob.searchRequirements) ? currentJob.searchRequirements : [];
        const hasDescription = description.length > 40;
        const hasPreferences = preferences.length > 0;
        const isThin = isJobBriefThin(currentJob);
        return {
          hasDescription,
          hasPreferences,
          hasNiceToHaves: niceToHaves.length > 0,
          skillCount: skills.length,
          isThin,
          guidance: isThin
            ? 'This role is still thin (likely pre-created from quick intake). Before searching, gather a real description, required experience/qualifications, and preferences (save as searchRequirements). Persist each answer with edit_job.'
            : 'This role has a solid brief. Once the founder is ready, run search_talent.',
        };
      })()
    : null;
  const context = {
    founder: { id: params.identity.founderId, name: params.identity.founderName, email: params.identity.email },
    company: serializeCompany(company),
    currentJob: serializeJob(currentJob),
    roleReadiness,
    session: serializeSession(session),
    conversationSignals: {
      builderWillDo: inferredBuilderWillDo,
      guidance: inferredBuilderWillDo
        ? 'The founder has already described what the builder should work on. Reuse this instead of asking what they will do.'
        : 'If scope is unclear, ask whether the builder is focused on a specific feature or the broader product.',
    },
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

  // A search actually ran (via search_talent OR a job edit that reran search) and produced
  // results — used by the UI to switch to the builders pane.
  const searchRan = toolCalls.some((tool) => {
    const result = tool.result as any;
    if (!result || result.error || result.needsFollowup) return false;
    return Boolean(result.search) && result.search.skipped !== true;
  });
  const searchNeedsFollowup = toolCalls.some(
    (tool) => (tool.result as any)?.needsFollowup
  );

  const response = {
    message: String(finalMessage),
    session: serializeSession(freshSession),
    job: serializeJob(freshJob),
    company: serializeCompany(freshCompany),
    history: freshMessages.map(serializeMessage),
    toolCalls,
    searchRan,
    searchNeedsFollowup,
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
  return {
    jobs: jobs.map(serializeJob),
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
