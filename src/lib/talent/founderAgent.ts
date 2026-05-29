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

export type FounderAgentIntent =
  | 'explain_startup'
  | 'create_startup_profile'
  | 'create_role_brief'
  | 'update_role_brief'
  | 'role_summary'
  | 'recommend_next_question'
  | 'ask_about_candidate';

export type FounderExtractedData = {
  company?: string | null;
  startupSummary?: string | null;
  industry?: string | null;
  roleTitle?: string | null;
  roleType?: string[] | null;
  workType?: string | null;
  skillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
  timeline?: string | null;
  budget?: string | null;
  locationPreference?: string | null;
  builderWillDo?: string | null;
  successIn30Days?: string | null;
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
    workType: 'What work type fits best — contract sprint, part-time, or full-time?',
    budget: 'What budget or compensation range do you have in mind?',
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

  if (raw.company !== undefined) out.company = str(raw.company);
  if (raw.startupSummary !== undefined) out.startupSummary = str(raw.startupSummary);
  if (raw.industry !== undefined) out.industry = str(raw.industry);
  if (raw.roleTitle !== undefined) out.roleTitle = str(raw.roleTitle);
  if (raw.workType !== undefined) out.workType = str(raw.workType);
  if (raw.timeline !== undefined) out.timeline = str(raw.timeline);
  if (raw.budget !== undefined) out.budget = str(raw.budget);
  if (raw.locationPreference !== undefined) out.locationPreference = str(raw.locationPreference);
  if (raw.builderWillDo !== undefined) out.builderWillDo = str(raw.builderWillDo);
  if (raw.successIn30Days !== undefined) out.successIn30Days = str(raw.successIn30Days);
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
  if (extracted.workType) opportunity.workType = extracted.workType;
  if (extracted.timeline) opportunity.timeline = extracted.timeline;
  if (extracted.budget) opportunity.budget = extracted.budget;
  if (extracted.builderWillDo) opportunity.builderWillDo = extracted.builderWillDo;
  if (extracted.successIn30Days) opportunity.successIn30Days = extracted.successIn30Days;
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
      workType: opportunity.workType,
      timeline: opportunity.timeline,
      budget: opportunity.budget,
      locationPreference: opportunity.locationPreference || opportunity.availabilityNeeded,
      successCriteria: opportunity.successIn30Days,
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
  const lower = userText.toLowerCase();
  const extracted: FounderExtractedData = {};

  const buildingMatch = userText.match(
    /(?:we'?re building|i'?m building|building)\s+(.+?)(?:\.\s+|\.\s*|,\s*|\s+i need|\s+and i need)/i
  );
  if (buildingMatch) {
    extracted.startupSummary = buildingMatch[1].trim();
    extracted.company = extracted.company || 'Your startup';
  }

  const needMatch = userText.match(
    /(?:i need|looking for|hire)\s+(?:a\s+)?(.+?)(?:\.\s+|\.\s*|,\s*|\s+in the|\s+within|\s+for\s+the|\s+over)/i
  );
  if (needMatch) {
    const role = needMatch[1].trim();
    if (!extracted.roleTitle) {
      extracted.roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  const timelineMatch = userText.match(/(\d+)\s*(weeks?|months?|days?)/i);
  if (timelineMatch) extracted.timeline = timelineMatch[0];

  if (/full[- ]?stack|fullstack/i.test(lower)) {
    extracted.roleTitle = extracted.roleTitle || 'Full Stack Developer';
    extracted.roleType = ['full_stack'];
    extracted.skillsNeeded = extracted.skillsNeeded || ['React', 'TypeScript', 'Node.js'];
    extracted.builderWillDo =
      extracted.builderWillDo || 'Full-stack development across frontend and backend for the product.';
  } else if (/flutter/i.test(lower)) {
    extracted.roleTitle = extracted.roleTitle || 'Flutter developer';
    extracted.roleType = ['mobile'];
    extracted.skillsNeeded = ['Flutter', 'Dart'];
  } else if (/\bai\b|machine learning|ml engineer/i.test(lower)) {
    extracted.roleTitle = extracted.roleTitle || 'AI engineer';
    extracted.roleType = ['ai_ml'];
    extracted.skillsNeeded = extracted.skillsNeeded || ['AI', 'LLMs', 'Python'];
  } else if (/designer[- ]?engineer|design engineer/i.test(lower)) {
    extracted.roleTitle = extracted.roleTitle || 'Designer-engineer';
    extracted.roleType = ['design', 'full_stack'];
    extracted.skillsNeeded = ['UI/UX', 'Frontend'];
  } else if (/mvp/i.test(lower)) {
    extracted.roleTitle = extracted.roleTitle || 'MVP builder';
    extracted.skillsNeeded = extracted.skillsNeeded || ['MVP', 'Full-stack'];
  }

  const skillMatches = userText.match(
    /\b(React|TypeScript|Tailwind|Node\.?js|Python|Flutter|Next\.?js|PostgreSQL|MongoDB)\b/gi
  );
  if (skillMatches) {
    const skills = [...new Set(skillMatches.map((s) => s.charAt(0).toUpperCase() + s.slice(1)))];
    extracted.skillsNeeded = [...(extracted.skillsNeeded || []), ...skills].filter(
      (v, i, a) => a.indexOf(v) === i
    );
  }

  if (/restaurant/i.test(lower)) extracted.industry = 'Restaurants / hospitality';
  if (/\$[\d,]+|\d+k\b|\d+\s*\/\s*hr/i.test(userText)) {
    const budgetMatch = userText.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?|\d+k(?:\s*[-–]\s*\d+k)?/i);
    if (budgetMatch) extracted.budget = budgetMatch[0];
  }

  if (/remote/i.test(lower)) extracted.locationPreference = 'Remote';
  if (/contract|sprint/i.test(lower)) extracted.workType = 'paid_sprint';
  if (/full[- ]?time/i.test(lower)) extracted.workType = 'full_time';
  if (/part[- ]?time/i.test(lower)) extracted.workType = 'part_time_contract';

  if (!extracted.builderWillDo && userText.length > 30) {
    extracted.builderWillDo =
      extracted.builderWillDo ||
      (/(ship|build|implement|develop)/i.test(lower)
        ? userText.trim().slice(0, 280)
        : `Ship product work for: ${extracted.roleTitle || 'this role'}.`);
  }

  if (!extracted.company && userText.length > 20) {
    extracted.company = 'Your startup';
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

const FOUNDER_AGENT_SYSTEM = `You are the Founder OS Agent for DevLabs, a proof-of-work talent marketplace.
Founders describe hiring needs in plain language. You extract structured role-brief data and help refine it.

After the FIRST founder message, infer everything you can and produce a draft role brief immediately. Do NOT interview field-by-field.

Required fields (mention gaps in Search Quality, do not force optional fields):
- Role title / role type
- What the builder will build (builderWillDo)
- Required skills
- Work type
- Timeline
- Budget
- Location preference

Optional (never require): success criteria, startup/customer problem context, funding stage, seniority, nice-to-have skills, example deliverable.

If startup context is missing, ask: "Do you want to add more startup context, or keep the brief focused on the work?" — NEVER ask "What problem does your startup solve for customers?" unless the founder explicitly wants help improving company context.

If the founder says skip / not needed / leave blank for a field, acknowledge and do not ask again.

If the founder edits the role (e.g. change ML to full stack), update roleTitle, roleType, skillsNeeded, builderWillDo accordingly and say: "I updated the brief. Want me to rerun the search with the updated role?" Do NOT restart intake or ask "what are you building?" again.

If the founder says "that's it" or similar, respond: "Got it. Your brief is ready. Want me to run the builder search?"

Tone: direct, founder-friendly, no emojis, no "Good luck", no "I think we have enough".

Return ONLY valid JSON:
{
  "intent": "create_role_brief"|"update_role_brief"|"role_summary"|"recommend_next_question"|"explain_startup"|"create_startup_profile"|"ask_about_candidate",
  "message": "<reply, at most one short question if truly needed>",
  "extractedData": { ... }
}`;

export async function parseFounderAgentTurn(params: {
  userText: string;
  history?: Array<{ role: string; content: string }>;
  opportunity: OpportunityLike | null;
  founderName?: string;
  isDone?: boolean;
  isFirstMessage?: boolean;
}): Promise<FounderAgentParseResult> {
  const { userText, history, opportunity, isDone, isFirstMessage } = params;

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
          workType: opportunity.workType,
          skillsNeeded: opportunity.skillsNeeded,
          niceToHaveSkills: opportunity.niceToHaveSkills,
          timeline: opportunity.timeline,
          budget: opportunity.budget,
          locationPreference: opportunity.locationPreference,
          builderWillDo: opportunity.builderWillDo,
          successIn30Days: opportunity.successIn30Days,
          seniority: opportunity.seniority,
          skippedFields: skipped,
        }
      : null,
    missingRequired: opportunity ? getMissingRequiredFields(opportunity, skipped) : [],
    missingOptional: opportunity ? getMissingOptionalFields(opportunity, skipped) : [],
    isDone,
    isFirstMessage,
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
