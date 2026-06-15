import BuilderProfile from '@/models/talent/BuilderProfile';
import Opportunity from '@/models/talent/Opportunity';
import ProjectRecord from '@/models/talent/ProjectRecord';
import MatchRecord from '@/models/talent/MatchRecord';
import Shortlist from '@/models/talent/Shortlist';
import IntroRequest from '@/models/talent/IntroRequest';
import CandidateFeedback from '@/models/talent/CandidateFeedback';
import { getOrRefreshTalentStats, formatStatsForPrompt, type TalentDatabaseStats } from '@/lib/talent/talentDatabaseStats';
import { enhanceRoleBriefForTalentPool, mergeEnhancementIntoFields } from '@/lib/talent/roleBriefEnhancer';
import { generateOpenRouterAgentTurn, getOpenRouterChatModel, generateOpenRouterReply, type AgentMessage, type ToolDefinition } from '@/lib/openrouter';
import { buildFounderUiBlocks } from '@/lib/talent/founderAgent';
import {
  applySanitizedToOpportunity,
  isPlaceholderCompany,
  sanitizeRoleBriefArgs,
  formatFounderStartupContextForPrompt,
  type FounderStartupContext,
} from '@/lib/talent/founderRoleBrief';
import { getMissingRequiredFields, canRunPreviewAnyway } from '@/lib/talent/founderSearchQuality';
import { buildFullCandidatesForShortlist } from '@/lib/talent/founderCandidate';
import { toPublicShortlist } from '@/lib/talent/builderSearch';
import { notifyBuilderIntroReceived } from '@/lib/talent/introFlow';
import { seedThreadFromIntro } from '@/lib/talent/messageFlow';
import {
  addFounderMemory,
  addOpportunityMemory,
  addCandidateFitMemory,
  getFounderMemoryProfile,
  getOpportunityMemoryProfile,
  formatMultiMemoryForPrompt,
} from '@/lib/talent/supermemory';
import {
  writeFounderRoleCreatedMemory,
  writeFounderRoleUpdatedMemory,
  writeFounderSearchRunMemory,
  writeFounderIntroSentMemory,
  writeFounderCandidateRejectionMemory,
  writeFounderCandidateSaveMemory,
} from '@/lib/agent/memoryWriter';
import { runFounderDiscoveryPipeline } from '@/lib/talent/discovery/index';
import type { SearchMode } from '@/lib/talent/discovery/strategy';
import { persistDiscoveryCandidates } from '@/lib/talent/founderSearchPersist';
import type { AgentSearchQualityBlock, AgentCandidateCardBlock } from '@/lib/agent/uiBlocks';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, ...(data as object) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FOUNDER_SYSTEM_PROMPT = `You are the DevLabs Founder Agent — a direct, no-nonsense hiring agent who helps founders find proof-backed builders fast.

Tone: speak like a sharp technical co-founder, not a recruiter. Blunt, fast, builder-native. No filler, no pleasantries, no emojis.

On EVERY first message: call get_all_roles first, then respond based on what you find:
- If get_all_roles returns existing roles: ask if they want to continue one or start fresh.
- If get_all_roles returns an empty list AND [Startup context] includes company + summary: you already know what they're building. Skip "what are you building" and company name. Ask ONE sharp question about the hire: "Who do you need to build it — role title and first deliverable?"
- If get_all_roles returns an empty list with no startup context: skip the pleasantries. Ask ONE sharp question: "What are you building and who do you need to build it?" — that's it.
- IMPORTANT: get_all_roles is the single source of truth for active roles. If your memory mentions role names but get_all_roles returns nothing, trust the tool — the roles were deleted. Never mention roles that aren't in the get_all_roles result.
- Never use "Great!", "Awesome!", "Sure!", or any filler affirmation.

PROACTIVE BEHAVIOUR — when descriptions are vague, poke hard:
- "I need a developer" → ask: what are they building? what stack? full-time or internship?
- "Someone good with AI" → ask: what specifically — RAG pipelines? fine-tuning? inference? and what's the output?
- "React developer" → ask: is this frontend-only or full-stack? what's the product context? what will they ship first?
Never accept vague answers. Always drill into: what specifically they will build, what stack, what hire type.

QUESTION ORDER — ask ONE question per turn, highest-signal first, so a useful search is reachable in ~3 answers:
1. What will they ship first (the concrete first deliverable) — this also disambiguates the role.
2. The exact stack / sub-domain — ask one sharp either/or (e.g. "retrieval or no retrieval", "frontend-only or full-stack", "native mobile or web").
3. Confirm the skill list (see ENHANCEMENT CONFIRMATION).
Only after those, collect logistics as option cards: hire type → timeline → location. Optionally capture seniority, funding stage, and an example deliverable when relevant.

ROLE AMBIGUITY — if the role title/description points one way but the listed skills point another (e.g. says "AI/ML" but skills are all React/TypeScript; says "mobile app" but skills are web-only; says "designer" but skills are pure engineering), call it out and make the founder pick a direction with an option card before searching. Use your judgement from the brief and the pool stats — don't guess.

ENHANCEMENT CONFIRMATION — create_role_brief / update_role_brief may return "enhancementApplied" (skills I mapped to the talent pool). When present, reflect it back and let the founder veto before moving on: "I mapped 'AI' → Python, OpenAI API, LangChain based on our pool — keep these or adjust?" Never silently change the skill list without telling the founder.

RARE SKILL WARNING — the [Talent Pool Intelligence] block in your context lists each top skill with its builder count. Before running a search, if a required skill is missing from that list or has a low count, warn the founder and offer to broaden: "Heads up — [skill] is rare in our pool. Want to make it nice-to-have or swap in [common alternative]?"

OPTION CARDS — whenever the answer is one of a short list, format your response like this:
First write your message, then on a new line write the question, then list numbered options:

What kind of hire are you looking for?
1. Full-time
2. Internship
3. Either works

Use this format for: hire type, location preference, timeline, seniority, search mode.

OPTION SELECTION — the founder selects options by sending the label text (e.g. "Full-time", "Internship", "Either works", "Remote", "Broad"). When their message matches a label from your previous options:
- Treat it as answering that question — call update_role_brief immediately with the correct field value.
- Do NOT ask for that field again in the same response or any subsequent response.
- Move directly to the next unanswered question.

Hire type label → field mapping (always use these exact values):
- "Full-time" → hireType: "full_time"
- "Internship" → hireType: "internship"
- "Either works" → hireType: "either"

NEVER RE-ASK — if a field was answered earlier in this conversation, never ask for it again. Check the role brief (get_role_brief) to confirm what is already filled before asking any question. Ask only about fields that are still missing. If [Startup context] already covers company, product, industry, or stage, do not ask for those again — use them when creating/updating the brief.

TOOL CHAINING:
- Always call get_all_roles first on init
- Call get_talent_pool_context before creating a new role brief to understand what skills are actually available
- Call get_role_brief before referencing any role field
- Call update_role_brief only with fields the founder explicitly stated — NEVER invent values
- After create/update: call get_role_brief to confirm what was saved
- When brief has roleTitle + builderWillDo + skillsNeeded: say "Brief looks solid. Want me to run the search?"
- After search: call get_shortlist and summarise who came back

TALENT POOL AWARENESS:
- The talent pool stats are injected into your context (see [Talent Pool Intelligence] block)
- When a founder asks for a rare skill (count < 3 in pool), warn them: "That skill is rare in our pool — only N builders have it. Want to broaden to [related common skill]?"
- Suggest skills that commonly appear together in the pool
- If a founder's desired role overlaps with multiple pool categories, confirm which is the priority

HIRE TYPE — only three values:
- full_time → "Full-time"
- internship → "Internship"
- either → "Either works"
Never use: contract, freelance, part-time, consulting.

CANDIDATE REVIEW — always use this structure:
- Why they fit (specific, not generic)
- Relevant projects and personal contribution
- Evidence quality: verified vs self-reported
- Gap or risk
- Next action

SEARCH QUALITY — after every search, always describe:
- How many strong candidates were found
- The main constraint limiting pool quality
- Whether to relax or tighten the search

DATA DISCIPLINE — for create_role_brief / update_role_brief:
- Only pass fields the founder explicitly stated OR fields already present in [Startup context] from onboarding research
- Never invent budgets, timelines, or company names beyond confirmed startup context
- Omit unknown fields entirely

Confirmation required before: sending an intro, rejecting a candidate, closing a role.
End every response with one concrete next step.`;

const FOUNDER_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_role_brief',
      description: 'Read the current role brief: company, role title, hire type, required skills, budget, timeline, location, and what the builder will build.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_roles',
      description: 'List all hiring requests created by this founder with their status and role titles.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_role_brief',
      description: 'Create a new hiring request. Use when the founder is describing a new role.',
      parameters: {
        type: 'object',
        properties: {
          roleTitle: { type: 'string' },
          company: { type: 'string' },
          startupSummary: { type: 'string' },
          builderWillDo: { type: 'string', description: 'What the builder will ship in the first few weeks' },
          skillsNeeded: { type: 'array', items: { type: 'string' } },
          niceToHaveSkills: { type: 'array', items: { type: 'string' } },
          hireType: { type: 'string', enum: ['full_time', 'internship', 'either'] },
          timeline: { type: 'string' },
          budget: { type: 'string' },
          locationPreference: { type: 'string' },
          seniority: { type: 'string', description: 'Experience level the founder wants, e.g. "intern/early", "builder with shipped proof", "senior owner"' },
          fundingStage: { type: 'string', description: 'Startup funding stage, e.g. pre-seed, seed, Series A, bootstrapped' },
          deliverables: { type: 'array', items: { type: 'string' }, description: 'Concrete first deliverables the builder will ship (e.g. "live MVP of the chat feature")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_role_brief',
      description: 'Update fields on the current role brief. Only pass the fields that need to change.',
      parameters: {
        type: 'object',
        properties: {
          roleTitle: { type: 'string' },
          company: { type: 'string' },
          startupSummary: { type: 'string' },
          builderWillDo: { type: 'string' },
          skillsNeeded: { type: 'array', items: { type: 'string' } },
          niceToHaveSkills: { type: 'array', items: { type: 'string' } },
          hireType: { type: 'string', enum: ['full_time', 'internship', 'either'] },
          timeline: { type: 'string' },
          budget: { type: 'string' },
          locationPreference: { type: 'string' },
          seniority: { type: 'string', description: 'Experience level the founder wants, e.g. "intern/early", "builder with shipped proof", "senior owner"' },
          fundingStage: { type: 'string', description: 'Startup funding stage, e.g. pre-seed, seed, Series A, bootstrapped' },
          deliverables: { type: 'array', items: { type: 'string' }, description: 'Concrete first deliverables the builder will ship' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_talent_pool_context',
      description: 'Get live statistics about the DevLabs builder talent pool: top skills, role categories, tech stacks, availability breakdown. Use this before creating or refining a role brief to understand what skills and roles are available.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_search',
      description: 'Run the builder discovery pipeline for the current role. Returns candidate count and search quality. Call get_shortlist after to see results.',
      parameters: {
        type: 'object',
        properties: {
          searchMode: { type: 'string', enum: ['broad', 'balanced', 'strict'], description: 'How strict the search should be (default: balanced)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_shortlist',
      description: 'Get the current candidate shortlist with proof details, fit scores, and recommended actions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_candidate_details',
      description: 'Get full details on a specific candidate: projects, contributions, tech stack, proof strength, and pipeline status.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Candidate name or anonymous label (e.g. "Candidate A")' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_intro',
      description: 'Send an intro request to a specific builder. Always confirm with the founder before calling this.',
      parameters: {
        type: 'object',
        properties: {
          builderName: { type: 'string' },
          message: { type: 'string', description: 'Personalized intro message to send' },
        },
        required: ['builderName', 'message'],
      },
    },
  },
];

const ADMIN_SCOUT_TOOL_NAMES = new Set([
  'get_role_brief',
  'get_all_roles',
  'create_role_brief',
  'update_role_brief',
  'get_talent_pool_context',
  'run_search',
  'get_shortlist',
  'get_candidate_details',
]);

const ADMIN_SCOUT_TOOLS = FOUNDER_TOOLS.filter((t) =>
  ADMIN_SCOUT_TOOL_NAMES.has(t.function.name)
);

const ADMIN_SCOUT_PROMPT_ADDENDUM = `

ADMIN SCOUT MODE — internal operator console:
- Skip intro requests, billing, and pipeline actions entirely.
- Optimize for search quality and candidate transparency.
- Company name can default to "Internal Scout" when the operator does not specify one.
- After search, summarize top matches with names and fit scores.`;

export type FounderAgentMode = 'founder' | 'admin_scout';

export async function runFounderAgentTurn(params: {
  email: string;
  founderName: string;
  founderId: string;
  userText: string;
  history: Array<{ role: string; content: string }>;
  currentOpportunity: any | null;
  founderStartupContext: FounderStartupContext;
  payloadOpportunityId: string | null;
  mode?: FounderAgentMode;
}): Promise<Response> {
  const {
    email,
    founderName,
    founderId,
    userText,
    history,
    founderStartupContext,
    payloadOpportunityId,
    mode = 'founder',
  } = params;
  const isAdminScout = mode === 'admin_scout';
  const agentTools = isAdminScout ? ADMIN_SCOUT_TOOLS : FOUNDER_TOOLS;

  let currentOpportunity = params.currentOpportunity;
  const oppId = () => currentOpportunity ? String(currentOpportunity._id) : null;

  // Load memory + talent stats in parallel
  const [founderProfile, oppProfile, talentStats] = await Promise.all([
    getFounderMemoryProfile(founderId, userText).catch(() => null),
    currentOpportunity
      ? getOpportunityMemoryProfile(String(currentOpportunity._id), userText).catch(() => null)
      : Promise.resolve(null),
    getOrRefreshTalentStats().catch(() => null) as Promise<TalentDatabaseStats | null>,
  ]);

  const memoryBlock = formatMultiMemoryForPrompt({
    founderProfile,
    opportunityMemories: [
      ...(oppProfile?.static ?? []),
      ...(oppProfile?.dynamic ?? []),
    ].filter(Boolean),
  });

  const startupBlock = formatFounderStartupContextForPrompt(founderStartupContext);

  const talentPoolBlock = talentStats
    ? `\n\n${formatStatsForPrompt(talentStats)}\n\nUse these pool statistics when creating or refining role briefs. Prefer skills that appear frequently in the pool. If the founder requests a skill that is rare in the pool, note it in the role brief as a stretch requirement.`
    : '';

  const systemPrompt =
    FOUNDER_SYSTEM_PROMPT +
    (isAdminScout ? ADMIN_SCOUT_PROMPT_ADDENDUM : '') +
    startupBlock +
    talentPoolBlock +
    (isAdminScout || !memoryBlock ? '' : '\n\n' + memoryBlock);

  let uiBlocks: any[] = [];
  let lastOpportunityId: string | null = payloadOpportunityId;

  async function runTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const opp = currentOpportunity;
    const currentOppId = opp ? String(opp._id) : null;

    switch (name) {
      case 'get_role_brief': {
        if (!opp) return { message: 'No active role brief yet. Use create_role_brief to start one.' };
        const o = opp.toObject ? opp.toObject() : opp;
        return {
          opportunityId: currentOppId,
          roleTitle: o.roleTitle,
          company: o.company,
          startupSummary: o.startupSummary,
          hireType: o.hireType || o.workType || null,
          builderWillDo: o.builderWillDo,
          skillsNeeded: o.skillsNeeded || [],
          niceToHaveSkills: o.niceToHaveSkills || [],
          timeline: o.timeline,
          budget: o.budget,
          locationPreference: o.locationPreference,
          status: o.status || 'draft',
          missingFields: getMissingRequiredFields(o, o.skippedFields || []),
        };
      }

      case 'get_talent_pool_context': {
        const stats = talentStats ?? await getOrRefreshTalentStats().catch(() => null);
        if (!stats) return { error: 'Talent pool stats unavailable right now.' };
        return {
          totalBuilders: stats.totalBuilders,
          availableNow: stats.availableNow,
          availabilityRate: `${stats.availabilityRate}%`,
          topSkills: stats.topSkills.slice(0, 15).map((s) => `${s.skill} (${s.count} builders)`),
          topProjectTechnologies: stats.topProjectTechnologies.slice(0, 15).map((s) => `${s.skill} (${s.count} projects)`),
          topRoleCategories: stats.topRoleCategories.slice(0, 8).map((r) => `${r.category} (${r.count})`),
          hireTypeBreakdown: stats.hireTypeBreakdown,
          remoteBreakdown: stats.remoteBreakdown,
          buildersWithVerifiedProjects: stats.buildersWithVerifiedProjects,
          avgProjectsPerBuilder: stats.avgProjectsPerBuilder,
          note: 'Use these stats to craft role briefs that align with actual builder supply. Prefer skills with higher counts for better match rates.',
        };
      }

      case 'get_all_roles': {
        const roles = await Opportunity.find({
          founderEmail: email,
          status: { $nin: ['closed', 'archived', 'deleted'] },
        })
          .sort({ updatedAt: -1 })
          .limit(10)
          .select('roleTitle company status hireType workType createdAt')
          .lean();
        return {
          roles: roles.map((r: any) => ({
            id: String(r._id),
            roleTitle: r.roleTitle,
            company: r.company,
            hireType: r.hireType || r.workType || null,
            status: r.status,
          })),
        };
      }

      case 'create_role_brief': {
        let fields = sanitizeRoleBriefArgs(args, founderStartupContext, userText);

        if (!fields.roleTitle) return { error: 'Need a concrete role title from the founder before creating the brief.' };
        if (!fields.company || isPlaceholderCompany(fields.company)) {
          if (isAdminScout) {
            fields.company = 'Internal Scout';
          } else {
            return { error: 'Need the real startup/company name.' };
          }
        }

        // AI enhancement — map founder inputs to skills/patterns that exist in the talent pool
        let enhancementNotes: string[] = [];
        if (talentStats) {
          try {
            const enhanced = await enhanceRoleBriefForTalentPool({ fields, talentStats, userText });
            enhancementNotes = enhanced.enhancementNotes;
            fields = mergeEnhancementIntoFields(fields, enhanced);
          } catch (e) {
            console.warn('[founderAgentRunner] create_role_brief enhancement failed:', e instanceof Error ? e.message : e);
          }
        }

        const newOpp = await Opportunity.create({
          founderName,
          founderEmail: email,
          company: fields.company,
          startupSummary: fields.startupSummary || null,
          industry: fields.industry || null,
          roleTitle: fields.roleTitle,
          builderWillDo: fields.builderWillDo || null,
          skillsNeeded: fields.skillsNeeded,
          niceToHaveSkills: fields.niceToHaveSkills,
          seniority: fields.seniority || null,
          fundingStage: fields.fundingStage || null,
          deliverables: fields.deliverables.length ? fields.deliverables : undefined,
          hireType: fields.hireType || null,
          workType: fields.workType || null,
          timeline: fields.timeline || null,
          budget: fields.budget || null,
          locationPreference: fields.locationPreference || null,
          skippedFields: [],
          status: 'draft',
        });
        currentOpportunity = newOpp;
        lastOpportunityId = String(newOpp._id);

        if (!isAdminScout) {
          void writeFounderRoleCreatedMemory(addFounderMemory, {
            founderId,
            founderName,
            opportunityId: String(newOpp._id),
            roleTitle: newOpp.roleTitle,
            company: newOpp.company,
            hireType: newOpp.hireType || newOpp.workType || 'unspecified',
            skills: newOpp.skillsNeeded || [],
          });
        }

        return {
          success: true,
          opportunityId: String(newOpp._id),
          roleTitle: newOpp.roleTitle,
          company: newOpp.company,
          skillsNeeded: newOpp.skillsNeeded,
          ...(enhancementNotes.length ? { enhancementApplied: enhancementNotes } : {}),
        };
      }

      case 'update_role_brief': {
        if (!opp) return { error: 'No active role brief. Create one first with create_role_brief.' };
        let fields = sanitizeRoleBriefArgs(args, founderStartupContext, userText);

        // AI enhancement on meaningful updates (skills or builderWillDo changing)
        let enhancementNotes: string[] = [];
        const hasSubstantiveUpdate = fields.skillsNeeded.length > 0 || fields.builderWillDo || fields.roleTitle;
        if (talentStats && hasSubstantiveUpdate) {
          try {
            const enhanced = await enhanceRoleBriefForTalentPool({ fields, talentStats, userText });
            enhancementNotes = enhanced.enhancementNotes;
            fields = mergeEnhancementIntoFields(fields, enhanced);
          } catch (e) {
            console.warn('[founderAgentRunner] update_role_brief enhancement failed:', e instanceof Error ? e.message : e);
          }
        }

        applySanitizedToOpportunity(opp, fields);
        const changed = ([
          fields.roleTitle ? 'roleTitle' : null,
          fields.company ? 'company' : null,
          fields.startupSummary ? 'startupSummary' : null,
          fields.builderWillDo ? 'builderWillDo' : null,
          fields.skillsNeeded.length ? 'skillsNeeded' : null,
          fields.niceToHaveSkills.length ? 'niceToHaveSkills' : null,
          fields.hireType ? 'hireType' : null,
          fields.timeline ? 'timeline' : null,
          fields.budget ? 'budget' : null,
          fields.locationPreference ? 'locationPreference' : null,
          fields.seniority ? 'seniority' : null,
          fields.fundingStage ? 'fundingStage' : null,
          fields.deliverables.length ? 'deliverables' : null,
        ] as Array<string | null>).filter(Boolean) as string[];
        await opp.save();

        if (!isAdminScout) {
          void writeFounderRoleUpdatedMemory(addFounderMemory, {
            founderId,
            founderName,
            opportunityId: currentOppId!,
            roleTitle: opp.roleTitle || 'Unknown',
            changedFields: changed,
          });
        }

        return {
          success: true,
          updated: changed,
          opportunityId: currentOppId,
          skillsNeeded: opp.skillsNeeded,
          ...(enhancementNotes.length ? { enhancementApplied: enhancementNotes } : {}),
        };
      }

      case 'run_search': {
        if (!opp) return { error: 'No active role brief. Create one first.' };
        const oppPlain = opp.toObject ? opp.toObject() : opp;
        if (!canRunPreviewAnyway(oppPlain)) {
          return { error: 'Role brief needs at least a role title, what they will build, and required skills before running search.' };
        }

        const searchMode: SearchMode = (args.searchMode as SearchMode) || 'balanced';

        // Load feedback history to adapt ranking weights
        const feedbackDocs = currentOppId
          ? await CandidateFeedback.find({ founderId, opportunityId: currentOppId, shouldAffectRanking: true })
              .sort({ createdAt: -1 })
              .limit(30)
              .lean()
          : [];
        const feedbackHistory = feedbackDocs.map((f: any) => ({
          founderId: f.founderId,
          opportunityId: f.opportunityId,
          builderId: f.builderId,
          action: f.action,
          reasonCategory: f.reasonCategory,
          notes: f.reasonText,
          shouldAffectRanking: f.shouldAffectRanking,
          createdAt: f.createdAt,
        }));

        const builders = await BuilderProfile.find({
          verificationStatus: { $ne: 'rejected' },
          visibilityStatus: { $ne: 'hidden' },
        }).limit(2000).lean();

        const builderIds = builders.map((b: any) => b._id);
        const allProjects = await ProjectRecord.find({ builderId: { $in: builderIds } })
          .select('builderId projectName description problemSolved techStack builderContribution contributionTags verificationStatus links')
          .lean();

        const projectsByBuilder = new Map<string, any[]>();
        for (const p of allProjects) {
          const key = String(p.builderId);
          if (!projectsByBuilder.has(key)) projectsByBuilder.set(key, []);
          projectsByBuilder.get(key)!.push(p);
        }

        const result = await runFounderDiscoveryPipeline({
          opportunity: oppPlain,
          founderId,
          builders,
          projectsByBuilder,
          searchMode,
          feedbackHistory,
          enableLlmRerank: true,
          generateReply: (sys, usr) => generateOpenRouterReply({ systemPrompt: sys, userPrompt: usr, temperature: 0, maxTokens: 400 }),
          limit: 12,
        });

        // Persist candidates as MatchRecords + Shortlist
        await persistDiscoveryCandidates({
          result,
          opportunityId: currentOppId!,
          founderEmail: email,
        });

        if (!isAdminScout) {
          void writeFounderSearchRunMemory(addFounderMemory, {
            founderId,
            founderName,
            opportunityId: currentOppId!,
            roleTitle: oppPlain.roleTitle || 'Unknown',
            totalFound: result.totalScanned,
            strongCount: result.searchQuality.strongCandidates,
            searchMode,
          });
        }

        // Build search quality UI block
        const sqBlock: AgentSearchQualityBlock = {
          type: 'search_quality_report',
          totalScanned: result.searchQuality.totalCandidatesScanned,
          totalRetrieved: result.searchQuality.totalCandidatesRetrieved,
          strongCount: result.searchQuality.strongCandidates,
          mediumCount: result.searchQuality.mediumCandidates,
          weakCount: result.searchQuality.weakCandidates,
          poolStrength: result.searchQuality.poolStrength,
          confidence: result.searchQuality.confidence,
          bottlenecks: result.searchQuality.bottlenecks,
          suggestedRelaxations: result.searchQuality.suggestedRelaxations,
          suggestedNextAction: result.searchQuality.suggestedRelaxations[0] || 'Call get_shortlist to review candidates.',
        };
        uiBlocks = [sqBlock];

        return {
          success: true,
          totalFound: result.totalScanned,
          strongMatches: result.searchQuality.strongCandidates,
          mediumMatches: result.searchQuality.mediumCandidates,
          previewCount: result.candidates.length,
          searchQuality: result.searchQuality.summary,
          bottlenecks: result.searchQuality.bottlenecks,
          suggestedRelaxations: result.searchQuality.suggestedRelaxations,
          message: `Found ${result.totalScanned} builders scanned. ${result.searchQuality.strongCandidates} strong matches, ${result.searchQuality.mediumCandidates} good matches. ${result.searchQuality.summary} Call get_shortlist to see them.`,
        };
      }

      case 'get_shortlist': {
        if (!currentOppId) return { message: 'No active role. Create a role brief first.' };
        const shortlistDoc = await Shortlist.findOne({ opportunityId: currentOppId, founderEmail: email });
        if (!shortlistDoc) return { message: 'No search run yet. Use run_search to find candidates.' };

        if (shortlistDoc.unlocked) {
          const full = await buildFullCandidatesForShortlist(shortlistDoc, opp?.toObject ? opp.toObject() : opp, { BuilderProfile, ProjectRecord, MatchRecord });
          return {
            shortlistState: 'unlocked',
            totalMatches: shortlistDoc.totalMatches,
            candidates: full.filter((c: any) => !c.hidden).map((c: any) => ({
              name: c.name,
              builderId: c.builderId,
              matchLabel: c.matchLabel,
              matchScore: c.matchScore,
              topSkills: c.topSkills || [],
              proofSummary: c.proofSummary,
              whyTheyMatch: c.whyTheyMatch,
              status: c.matchStatus,
              riskFlags: c.riskFlags || [],
              missingProof: c.missingProof || [],
            })),
          };
        }

        return {
          shortlistState: 'locked',
          totalMatches: shortlistDoc.totalMatches,
          strongMatches: shortlistDoc.strongMatchCount,
          candidates: (shortlistDoc.candidates as any[] || []).map((c: any) => ({
            anonymousLabel: c.anonymousLabel,
            matchLabel: c.matchLabel,
            topSkills: c.topSkills || [],
            proofSummary: c.proofSummary,
            whyTheyMatch: c.whyTheyMatch,
          })),
        };
      }

      case 'get_candidate_details': {
        const queryName = String(args.name || '');
        if (!currentOppId) return { error: 'No active role.' };
        const shortlistDoc = await Shortlist.findOne({ opportunityId: currentOppId, founderEmail: email });
        if (!shortlistDoc) return { error: 'Run search first to get candidates.' };
        if (!shortlistDoc.unlocked) return { error: 'Shortlist is locked. Unlock to see individual candidate details.' };

        const full = await buildFullCandidatesForShortlist(shortlistDoc, opp?.toObject ? opp.toObject() : opp, { BuilderProfile, ProjectRecord, MatchRecord });
        const candidate = full.find((c: any) =>
          c.name?.toLowerCase().includes(queryName.toLowerCase()) ||
          String(c.anonymousLabel || '').toLowerCase().includes(queryName.toLowerCase())
        );
        if (!candidate) return { error: `Could not find candidate "${queryName}" in this shortlist.` };

        return {
          name: candidate.name,
          builderId: candidate.builderId,
          headline: candidate.headline,
          matchLabel: candidate.matchLabel,
          matchScore: candidate.matchScore,
          whyTheyMatch: candidate.whyTheyMatch,
          proofSummary: candidate.proofSummary,
          topSkills: candidate.topSkills || [],
          riskFlags: candidate.riskFlags || [],
          missingProof: candidate.missingProof || [],
          projects: (candidate.projects || []).slice(0, 4).map((p: any) => ({
            title: p.projectName,
            contribution: p.builderContribution,
            tech: p.techStack?.slice(0, 4),
            verified: p.verificationStatus === 'builder_confirmed',
            githubUrl: p.links?.github || null,
            demoUrl: p.links?.demo || null,
          })),
          availability: candidate.availabilitySummary,
          status: candidate.matchStatus,
        };
      }

      case 'request_intro': {
        if (isAdminScout) return { error: 'Intro requests are disabled in admin scout mode.' };
        const builderName = String(args.builderName || '');
        const message = String(args.message || '');
        if (!currentOppId || !opp) return { error: 'No active role brief.' };
        if (!message || message.length < 20) return { error: 'Intro message must be at least 20 characters.' };

        const shortlistDoc = await Shortlist.findOne({ opportunityId: currentOppId, founderEmail: email });
        if (!shortlistDoc?.unlocked) return { error: 'Unlock the shortlist before requesting intros.' };

        const full = await buildFullCandidatesForShortlist(shortlistDoc, opp.toObject ? opp.toObject() : opp, { BuilderProfile, ProjectRecord, MatchRecord });
        const candidate = full.find((c: any) => c.name?.toLowerCase().includes(builderName.toLowerCase()));
        if (!candidate) return { error: `Could not find "${builderName}" in this shortlist.` };

        const matchRecord = await MatchRecord.findOne({ builderId: candidate.builderId, opportunityId: currentOppId });
        if (!matchRecord) return { error: 'Match record not found for this candidate.' };

        const intro = await IntroRequest.findOneAndUpdate(
          { opportunityId: currentOppId, builderId: candidate.builderId },
          { $set: { opportunityId: currentOppId, builderId: candidate.builderId, matchRecordId: matchRecord._id, founderEmail: email, founderName, introMessage: message, status: 'requested' } },
          { upsert: true, new: true }
        );
        matchRecord.status = 'intro_requested';
        matchRecord.pipelineNextStep = 'Awaiting builder response';
        await matchRecord.save();

        const oppPlain = opp.toObject ? opp.toObject() : opp;
        const builderDoc = await BuilderProfile.findById(candidate.builderId).select('email').lean() as any;
        if (builderDoc?.email) {
          await notifyBuilderIntroReceived({
            builderId: String(candidate.builderId),
            builderEmail: String(builderDoc.email),
            founderName,
            roleTitle: oppPlain.roleTitle || 'Role',
            company: oppPlain.company || 'Startup',
            introRequestId: String(intro._id),
          });
        }
        await seedThreadFromIntro(intro);

        void writeFounderIntroSentMemory(addFounderMemory, {
          founderId,
          founderName,
          builderId: String(candidate.builderId),
          builderName,
          opportunityId: currentOppId,
          roleTitle: oppPlain.roleTitle || 'Unknown',
        });

        return { success: true, builderName, introId: String(intro._id), message: `Intro request sent to ${builderName}.` };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  const messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userText },
  ];

  let agentResponse = await generateOpenRouterAgentTurn({ messages, tools: agentTools, temperature: 0.3, maxTokens: 700 });
  const MAX_ITERATIONS = 5;
  let iterations = 0;

  while (agentResponse.tool_calls?.length && iterations < MAX_ITERATIONS) {
    iterations++;
    messages.push({ role: 'assistant', content: agentResponse.content ?? null, tool_calls: agentResponse.tool_calls });

    const toolResults = await Promise.all(
      agentResponse.tool_calls.map(async (tc) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        console.log(`[founderAgentRunner] tool_call: ${tc.function.name}`, args);
        let result: Record<string, unknown>;
        try {
          result = await runTool(tc.function.name, args);
        } catch (err) {
          result = {
            error: err instanceof Error ? err.message : 'Tool execution failed',
          };
        }

        if ((tc.function.name === 'create_role_brief' || tc.function.name === 'update_role_brief') && result.opportunityId) {
          lastOpportunityId = String(result.opportunityId);
        }
        if (tc.function.name === 'get_role_brief' && !('error' in result) && !('message' in result) && currentOpportunity) {
          uiBlocks = buildFounderUiBlocks(currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity);
        }
        if (tc.function.name === 'create_role_brief' && result.success && currentOpportunity) {
          uiBlocks = buildFounderUiBlocks(currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity);
        }
        if (tc.function.name === 'update_role_brief' && result.success && currentOpportunity) {
          uiBlocks = buildFounderUiBlocks(currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity);
        }

        return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
      })
    );

    messages.push(...toolResults);
    agentResponse = await generateOpenRouterAgentTurn({ messages, tools: FOUNDER_TOOLS, temperature: 0.3, maxTokens: 700 });
  }

  const finalMessage = agentResponse.content || 'I ran into an issue. Try again.';
  const finalOpp = currentOpportunity
    ? (currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity)
    : null;

  const shortlistDoc = finalOpp
    ? await Shortlist.findOne({ opportunityId: String(finalOpp._id), founderEmail: email })
    : null;

  if (finalOpp && uiBlocks.length === 0) {
    uiBlocks = buildFounderUiBlocks(finalOpp);
  }

  const skipped = finalOpp?.skippedFields || [];
  const missingRequired = finalOpp ? getMissingRequiredFields(finalOpp, skipped) : [];

  console.log('[founderAgentRunner] done', { founderId, iterations, toolsCalled: messages.filter((m) => m.role === 'tool').length });

  return ok({
    message: finalMessage,
    opportunity: finalOpp,
    uiBlocks,
    session: finalOpp
      ? {
          currentSearchId: String(finalOpp._id),
          currentRoleBrief: finalOpp,
          skippedFields: skipped,
          missingRequiredFields: missingRequired,
          shortlistState: shortlistDoc?.unlocked ? 'unlocked' : shortlistDoc ? 'locked' : 'none',
        }
      : null,
    meta: { model: getOpenRouterChatModel(), iterations },
  });
}
