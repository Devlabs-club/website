import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import {
  detectRoleAmbiguity,
  getFilledOptionalFields,
  getFilledRequiredFields,
  getMissingOptionalFields,
  getMissingRequiredFields,
  getSearchQualityRating,
  getSkippedFields,
  REQUIRED_FIELD_CHECKS,
  type OpportunityLike,
} from '@/lib/talent/founderSearchQuality';
import {
  extractRoleHintsFromUserText,
  isPlaceholderCompany,
  isPlaceholderRoleTitle,
} from '@/lib/talent/founderRoleBrief';

export type FounderAgentIntent =
  | 'explain_startup'
  | 'create_startup_profile'
  | 'create_role_brief'
  | 'update_role_brief'
  | 'role_summary'
  | 'recommend_next_question'
  | 'ask_about_candidate';

export type HireType = 'full_time' | 'internship' | 'either';

export type FounderExtractedData = {
  company?: string | null;
  startupSummary?: string | null;
  industry?: string | null;
  roleTitle?: string | null;
  roleType?: string[] | null;
  hireType?: HireType | null;
  workType?: string | null;
  skillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
  timeline?: string | null;
  budget?: string | null;
  locationPreference?: string | null;
  builderWillDo?: string | null;
  seniority?: string | null;
  hoursPerWeek?: string | null;
  deliverables?: string[] | null;
  fundingStage?: string | null;
};

export type FounderAgentParseResult = {
  intent: FounderAgentIntent;
  message: string;
  extractedData: FounderExtractedData;
};

export type FounderUiBlock = {
  type:
    | 'role_brief'
    | 'missing_fields'
    | 'next_question'
    | 'search_quality'
    | 'role_ambiguity'
    | 'preview_explanation';
  title?: string;
  body?: string;
  items?: string[];
  meta?: Record<string, unknown>;
};

export function getMissingMaterialFields(opportunity: OpportunityLike): string[] {
  return getMissingRequiredFields(opportunity);
}

export function getMissingCoreFields(opportunity: OpportunityLike): string[] {
  return getMissingRequiredFields(opportunity);
}

export function pickNextQuestion(opportunity: OpportunityLike): string | null {
  const skipped = getSkippedFields(opportunity);
  const missingRequired = REQUIRED_FIELD_CHECKS.filter(
    (f) => !skipped.includes(f.key) && !f.check(opportunity)
  );

  if (missingRequired.length === 0) return null;

  const field = missingRequired[0];
  const prompts: Record<string, string> = {
    roleTitle: 'What role title best describes who you need (e.g. Full-stack MVP builder)?',
    builderWillDo: 'What should this builder ship in the first few weeks?',
    skillsNeeded: 'What skills or stack should they have (e.g. React, Node, Python)?',
    timeline: 'What timeline are you working toward?',
    workType: 'What kind of hire are you looking for — full-time, internship, or either works?',
    locationPreference: 'Any location preference — remote, hybrid, or in-person?',
  };

  if (field.key === 'startupSummary') {
    return 'Do you want to add more startup context, or keep the brief focused on the work? (This field is optional.)';
  }

  return prompts[field.key] || `Can you share your ${field.label.toLowerCase()}?`;
}

function normalizeExtractedData(raw: Record<string, unknown>): FounderExtractedData {
  const out: FounderExtractedData = {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  if (raw.company !== undefined) {
    const c = str(raw.company);
    out.company = c && !isPlaceholderCompany(c) ? c : null;
  }
  if (raw.startupSummary !== undefined) out.startupSummary = str(raw.startupSummary);
  if (raw.industry !== undefined) out.industry = str(raw.industry);
  if (raw.roleTitle !== undefined) {
    const t = str(raw.roleTitle);
    out.roleTitle = t && !isPlaceholderRoleTitle(t) ? t : null;
  }
  if (raw.workType !== undefined) out.workType = str(raw.workType);
  if (raw.hireType !== undefined) {
    const ht = str(raw.hireType);
    out.hireType = ht === 'full_time' || ht === 'internship' || ht === 'either' ? ht : null;
  }
  if (raw.timeline !== undefined) out.timeline = str(raw.timeline);
  if (raw.budget !== undefined) {
    const b = str(raw.budget);
    out.budget = b;
  }
  if (raw.locationPreference !== undefined) out.locationPreference = str(raw.locationPreference);
  if (raw.builderWillDo !== undefined) out.builderWillDo = str(raw.builderWillDo);
  if (raw.seniority !== undefined) out.seniority = str(raw.seniority);
  if (raw.hoursPerWeek !== undefined) out.hoursPerWeek = str(raw.hoursPerWeek);
  if (raw.fundingStage !== undefined) out.fundingStage = str(raw.fundingStage);

  if (raw.roleType !== undefined) {
    out.roleType = Array.isArray(raw.roleType)
      ? raw.roleType.map(String).filter(Boolean)
      : raw.roleType
        ? [String(raw.roleType)]
        : [];
  }
  const arrField = (key: 'skillsNeeded' | 'niceToHaveSkills' | 'deliverables', rawKey: string) => {
    const rawVal = raw[rawKey];
    if (rawVal === undefined) return;
    const val = Array.isArray(rawVal)
      ? rawVal.map(String).filter(Boolean)
      : typeof rawVal === 'string'
        ? rawVal.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    out[key] = val;
  };
  arrField('skillsNeeded', 'skillsNeeded');
  arrField('niceToHaveSkills', 'niceToHaveSkills');
  arrField('deliverables', 'deliverables');

  return out;
}

export function mergeExtractedIntoOpportunity(
  opportunity: OpportunityLike,
  extracted: FounderExtractedData
): void {
  if (extracted.company) opportunity.company = extracted.company;
  if (extracted.startupSummary) opportunity.startupSummary = extracted.startupSummary;
  if (extracted.industry) opportunity.industry = extracted.industry;
  if (extracted.roleTitle) opportunity.roleTitle = extracted.roleTitle;
  if (extracted.hireType) opportunity.hireType = extracted.hireType;
  if (extracted.workType) opportunity.workType = extracted.workType;
  if (extracted.timeline) opportunity.timeline = extracted.timeline;
  if (extracted.budget) opportunity.budget = extracted.budget;
  if (extracted.builderWillDo) opportunity.builderWillDo = extracted.builderWillDo;
  if (extracted.seniority) opportunity.seniority = extracted.seniority;
  if (extracted.hoursPerWeek) opportunity.hoursPerWeek = extracted.hoursPerWeek;
  if (extracted.fundingStage) opportunity.fundingStage = extracted.fundingStage;
  if (extracted.locationPreference) {
    opportunity.locationPreference = extracted.locationPreference;
    opportunity.availabilityNeeded = extracted.locationPreference;
  }
  if (Array.isArray(extracted.roleType) && extracted.roleType.length) {
    opportunity.roleType = extracted.roleType;
  }
  if (Array.isArray(extracted.skillsNeeded) && extracted.skillsNeeded.length) {
    opportunity.skillsNeeded = extracted.skillsNeeded;
  }
  if (Array.isArray(extracted.niceToHaveSkills) && extracted.niceToHaveSkills.length) {
    opportunity.niceToHaveSkills = extracted.niceToHaveSkills;
  }
  if (Array.isArray(extracted.deliverables) && extracted.deliverables.length) {
    opportunity.deliverables = extracted.deliverables;
  }
}

export function buildFounderUiBlocks(opportunity: OpportunityLike): FounderUiBlock[] {
  const blocks: FounderUiBlock[] = [];
  const id = (opportunity as { _id?: unknown })._id
    ? String((opportunity as { _id?: unknown })._id)
    : undefined;
  const skipped = getSkippedFields(opportunity);

  blocks.push({
    type: 'role_brief',
    title:
      opportunity.roleTitle && opportunity.company
        ? `${opportunity.roleTitle} @ ${opportunity.company}`
        : 'Role brief (draft)',
    body: opportunity.startupSummary || undefined,
    meta: {
      opportunityId: id,
      roleTitle: opportunity.roleTitle,
      company: opportunity.company,
      startupDescription: opportunity.startupSummary,
      industry: opportunity.industry,
      builderWillDo: opportunity.builderWillDo,
      requiredSkills: opportunity.skillsNeeded || [],
      niceToHaveSkills: opportunity.niceToHaveSkills || [],
      roleType: opportunity.roleType || [],
      hireType: (opportunity as any).hireType || null,
      workType: opportunity.workType,
      timeline: opportunity.timeline,
      budget: opportunity.budget,
      locationPreference: opportunity.locationPreference || opportunity.availabilityNeeded,
      seniority: opportunity.seniority,
      hoursPerWeek: opportunity.hoursPerWeek,
      deliverables: opportunity.deliverables || [],
      fundingStage: opportunity.fundingStage,
      status: opportunity.status || 'draft',
      skippedFields: skipped,
    },
  });

  const rating = getSearchQualityRating(opportunity);
  const filledRequired = getFilledRequiredFields(opportunity);
  const filledOptional = getFilledOptionalFields(opportunity);
  const missingRequired = getMissingRequiredFields(opportunity, skipped);
  const missingOptional = getMissingOptionalFields(opportunity, skipped);

  blocks.push({
    type: 'search_quality',
    title: `Search Quality: ${rating}`,
    meta: {
      rating,
      filledRequired,
      missingRequired,
      filledOptional,
      missingOptional,
      canRunPreview: filledRequired.length >= 3 || missingRequired.length <= 2,
    },
  });

  const ambiguity = detectRoleAmbiguity(opportunity);
  if (ambiguity) {
    blocks.push({
      type: 'role_ambiguity',
      title: 'Role looks ambiguous',
      body: 'You mentioned AI/ML, but the skills listed are mostly full-stack/frontend. Choose one:',
      items: ambiguity.choices,
    });
  }

  if (missingRequired.length > 0) {
    blocks.push({
      type: 'missing_fields',
      title: 'Required fields still open',
      items: missingRequired,
      meta: { optional: false },
    });
  }

  const nextQ = pickNextQuestion(opportunity);
  if (nextQ && missingRequired.length > 0) {
    blocks.push({
      type: 'next_question',
      title: 'Optional follow-up',
      body: nextQ,
    });
  }

  return blocks;
}

function detectIntentFromText(text: string, hasOpportunity: boolean): FounderAgentIntent {
  const lower = text.toLowerCase();
  if (/(tell me more about|more about|who is|what about).*(for this role|for the role)/i.test(text)) {
    return 'ask_about_candidate';
  }
  if (/(summary|recap|what do you have|show (me )?the brief)/i.test(lower)) return 'role_summary';
  if (/(update|change|edit|adjust|switch|replace)/i.test(lower) && hasOpportunity) return 'update_role_brief';
  if (/(what should i ask|next question|what else)/i.test(lower)) return 'recommend_next_question';
  if (hasOpportunity) return 'update_role_brief';
  return 'create_role_brief';
}

function deterministicExtract(userText: string): FounderExtractedData {
  const hints = extractRoleHintsFromUserText(userText);
  const extracted: FounderExtractedData = {};

  if (hints.roleTitle) extracted.roleTitle = hints.roleTitle;
  if (hints.company) extracted.company = hints.company;
  if (hints.startupSummary) extracted.startupSummary = hints.startupSummary;
  if (hints.timeline) extracted.timeline = hints.timeline;
  if (hints.budget) extracted.budget = hints.budget;
  if (hints.locationPreference) extracted.locationPreference = hints.locationPreference;
  if (hints.hireType) extracted.hireType = hints.hireType;
  if (hints.skillsNeeded?.length) extracted.skillsNeeded = hints.skillsNeeded;

  const lower = userText.toLowerCase();
  if (/restaurant/i.test(lower)) extracted.industry = 'Restaurants / hospitality';

  if (/(ship|build|implement|develop)/i.test(lower) && userText.length > 20) {
    extracted.builderWillDo = userText.trim().slice(0, 400);
  }

  return extracted;
}

function deterministicParse(
  userText: string,
  opportunity: OpportunityLike | null,
  options?: { isDone?: boolean; isFirstMessage?: boolean }
): FounderAgentParseResult {
  const intent = detectIntentFromText(userText, Boolean(opportunity));
  const extractedData = deterministicExtract(userText);

  if (intent === 'ask_about_candidate') {
    return {
      intent,
      message: '',
      extractedData: {},
    };
  }

  if (intent === 'role_summary' && opportunity) {
    return {
      intent,
      message: `Your role brief is ready for ${opportunity.roleTitle} at ${opportunity.company}. Edit any field manually on the right, or ask me to refine something.`,
      extractedData: {},
    };
  }

  if (options?.isDone) {
    return {
      intent: 'update_role_brief',
      message: 'Got it. Your brief is ready. Want me to run the builder search?',
      extractedData: {},
    };
  }

  const merged = { ...(opportunity || {}), ...extractedData };
  const missingRequired = getMissingRequiredFields(merged, getSkippedFields(opportunity));

  if (intent === 'update_role_brief' && opportunity && /(change|update|edit|switch)/i.test(userText)) {
    return {
      intent,
      message: 'I updated the brief. Want me to rerun the search with the updated role?',
      extractedData,
    };
  }

  if (options?.isFirstMessage || !opportunity) {
    return {
      intent: 'create_role_brief',
      message:
        missingRequired.length > 0
          ? `I drafted a role brief from what you shared. Fill any gaps in the Search Quality card, or tell me what to change. ${missingRequired.length > 0 ? `Still needed: ${missingRequired.slice(0, 3).join(', ')}.` : ''}`
          : 'Your role brief is ready. Run a free preview when you want to see matched builders.',
      extractedData,
    };
  }

  if (missingRequired.length === 0) {
    return {
      intent: 'update_role_brief',
      message: 'Your role brief is ready. Run a free preview, or tell me what to change.',
      extractedData,
    };
  }

  return {
    intent: 'update_role_brief',
    message: `I updated the brief. ${missingRequired.length > 0 ? `Still open: ${missingRequired.slice(0, 2).join(', ')} — or say "that's it" when you're ready to search.` : ''}`,
    extractedData,
  };
}

const FOUNDER_AGENT_SYSTEM = `You are the DevLabs Founder Agent.

Your job is to help founders create hiring requests, search the proof-backed builder graph, evaluate builder profiles, request intros, create work trials, manage candidates, and operate the founder dashboard.

HIRING TYPES — only three values are allowed. Never use contract, freelance, part-time, temporary, consulting, or project-based.
- full_time → label: "Full-time"
- internship → label: "Internship"
- either → label: "Either works"

When creating a hiring request, always identify the hire type. If not stated, ask: "What kind of hire are you looking for?" and present the three options.

After the FIRST founder message, infer everything you can and produce a draft role brief immediately. Do NOT interview field-by-field.

Required role brief fields:
- Role title
- What the builder will build (builderWillDo)
- Required skills
- Hire type (full_time | internship | either)
- Timeline
- Location preference

Optional (never require): budget/compensation, startup context, funding stage, seniority, nice-to-have skills, deliverables.

NEVER invent or guess values. Only populate extractedData fields the founder explicitly stated in this turn or prior messages. Use null for unknown fields. Do not use placeholder company names like "Your startup" or generic role titles like "New role". Do not invent budget unless the founder stated compensation, salary, pay, or a dollar amount.

Use the founder's memory context (founderMemory field in Context JSON) to remember company context, hiring preferences, preferred tech stack, previous searches, budget patterns, candidate feedback, and recurring concerns. Do not ask for information already known from memory.

When reviewing candidates:
- Explain why this builder fits using evidence from their profile
- Show relevant proof, personal contribution, and evidence quality
- Surface risks honestly — do not present profiles as guaranteed fits
- Separate verified evidence from self-reported claims
- Never invent proof
- Recommend a clear next action

When possible, use option cards instead of open-ended questions (fewer than 6 options → show options).

Ask for confirmation before externally visible or irreversible actions: sending an intro, sending a message, sending a work trial, rejecting a candidate, closing a hiring request, scheduling or rescheduling a call.

Tone: direct, founder-friendly, evidence-first, no emojis, no "Good luck", no filler.

If the founder says skip / not needed / leave blank for a field, acknowledge and do not ask again.
If the founder edits the role, update the brief and say: "Updated. Want me to rerun the search?" Do NOT restart intake.
If the founder says "that's it" or similar, respond: "Got it. Your brief is ready. Want me to run the builder search?"

Return ONLY valid JSON:
{
  "intent": "create_role_brief"|"update_role_brief"|"role_summary"|"recommend_next_question"|"explain_startup"|"create_startup_profile"|"ask_about_candidate",
  "message": "<reply to founder — direct, no filler, at most one question if truly needed>",
  "extractedData": {
    "roleTitle": string|null,
    "company": string|null,
    "startupSummary": string|null,
    "roleType": string[]|null,
    "hireType": "full_time"|"internship"|"either"|null,
    "skillsNeeded": string[]|null,
    "niceToHaveSkills": string[]|null,
    "timeline": string|null,
    "budget": string|null,
    "locationPreference": string|null,
    "builderWillDo": string|null,
    "seniority": string|null,
    "hoursPerWeek": string|null,
    "deliverables": string[]|null,
    "fundingStage": string|null
  }
}`;

export async function parseFounderAgentTurn(params: {
  userText: string;
  history?: Array<{ role: string; content: string }>;
  opportunity: OpportunityLike | null;
  founderName?: string;
  isDone?: boolean;
  isFirstMessage?: boolean;
  memoryContext?: string;
}): Promise<FounderAgentParseResult> {
  const { userText, history, opportunity, isDone, isFirstMessage, memoryContext } = params;

  if (!hasOpenRouterConfig()) {
    return deterministicParse(userText, opportunity, { isDone, isFirstMessage });
  }

  const skipped = getSkippedFields(opportunity);
  const context = {
    currentDraft: opportunity
      ? {
          company: opportunity.company,
          startupSummary: opportunity.startupSummary,
          roleTitle: opportunity.roleTitle,
          roleType: opportunity.roleType,
          hireType: (opportunity as any).hireType || opportunity.workType || null,
          skillsNeeded: opportunity.skillsNeeded,
          niceToHaveSkills: opportunity.niceToHaveSkills,
          timeline: opportunity.timeline,
          budget: opportunity.budget,
          locationPreference: opportunity.locationPreference,
          builderWillDo: opportunity.builderWillDo,
          seniority: opportunity.seniority,
          skippedFields: skipped,
        }
      : null,
    missingRequired: opportunity ? getMissingRequiredFields(opportunity, skipped) : [],
    missingOptional: opportunity ? getMissingOptionalFields(opportunity, skipped) : [],
    isDone,
    isFirstMessage,
    ...(memoryContext ? { founderMemory: memoryContext } : {}),
  };

  try {
    const raw = await generateOpenRouterReply({
      systemPrompt: FOUNDER_AGENT_SYSTEM,
      userPrompt: `Context:\n${JSON.stringify(context, null, 2)}\n\nFounder says: "${userText}"`,
      temperature: 0.25,
      maxTokens: 700,
      history,
    });

    const parsed = JSON.parse(raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim());
    const intent = (parsed.intent || 'create_role_brief') as FounderAgentIntent;
    const validIntents: FounderAgentIntent[] = [
      'explain_startup',
      'create_startup_profile',
      'create_role_brief',
      'update_role_brief',
      'role_summary',
      'recommend_next_question',
      'ask_about_candidate',
    ];

    if (isDone) {
      return {
        intent: 'update_role_brief',
        message: 'Got it. Your brief is ready. Want me to run the builder search?',
        extractedData: {},
      };
    }

    return {
      intent: validIntents.includes(intent) ? intent : 'update_role_brief',
      message:
        typeof parsed.message === 'string'
          ? parsed.message
          : 'I drafted your role brief. Review it on the right and tell me what to change.',
      extractedData: normalizeExtractedData(
        typeof parsed.extractedData === 'object' && parsed.extractedData ? parsed.extractedData : {}
      ),
    };
  } catch {
    return deterministicParse(userText, opportunity, { isDone, isFirstMessage });
  }
}
