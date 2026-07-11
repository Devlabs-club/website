import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import { getSearchRequirements, type SearchRequirement } from '@/lib/talent/searchTokens';

export type SearchPlanEvidenceField =
  | 'experiences.company'
  | 'experiences.title'
  | 'experiences.description'
  | 'education.school'
  | 'education.field'
  | 'headline'
  | 'bio'
  | 'skills'
  | 'rolePreference'
  | 'projects';

export type CompiledRequirement = {
  text: string;
  importance: 'must' | 'nice';
  mode: 'literal' | 'category' | 'skill' | 'project_evidence' | 'school' | 'other';
  /** Tokens/phrases that satisfy this requirement when found in evidence (OR). */
  matchAnyOf: string[];
  /** Optional tokens that strengthen a partial match. */
  matchHints: string[];
  evidenceFields: SearchPlanEvidenceField[];
  /** Terms to add to retrieval (index / semantic / keyword). */
  retrievalTerms: string[];
  rationale: string;
};

export type SearchPlan = {
  version: 1;
  sourceHash: string;
  compiledAt: string;
  requirements: CompiledRequirement[];
  /** Flattened retrieval terms across all requirements. */
  retrievalTerms: string[];
  compiledBy: 'llm' | 'fallback';
};

const EVIDENCE_FIELDS: SearchPlanEvidenceField[] = [
  'experiences.company',
  'experiences.title',
  'experiences.description',
  'education.school',
  'education.field',
  'headline',
  'bio',
  'skills',
  'rolePreference',
  'projects',
];

function norm(value: string): string {
  return value.toLowerCase().trim();
}

function uniqueStrings(values: Array<string | null | undefined>, max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = String(value || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

/** Stable hash of requirements so we recompile only when founder prefs change. */
export function hashSearchRequirements(requirements: SearchRequirement[]): string {
  const payload = requirements
    .map((requirement) => `${requirement.importance}:${norm(requirement.text)}`)
    .sort()
    .join('|');
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `sr_${hash.toString(16)}`;
}

export function getCachedSearchPlan(opportunity: any): SearchPlan | null {
  const plan = opportunity?.searchPlan;
  if (!plan || plan.version !== 1 || !Array.isArray(plan.requirements)) return null;
  const requirements = getSearchRequirements(opportunity);
  if (!requirements.length) return null;
  if (plan.sourceHash !== hashSearchRequirements(requirements)) return null;
  return plan as SearchPlan;
}

function inferMode(text: string): CompiledRequirement['mode'] {
  const lower = text.toLowerCase();
  if (/school|university|college|stanford|yale|mit|berkeley|cmu|ivy/i.test(lower)) return 'school';
  if (/intern|company|worked at|ex-|faang|big[\s-]?tech|startup|yc/i.test(lower)) return 'category';
  if (/built|project|shipped|demo|github|feature|chat|dashboard/i.test(lower)) return 'project_evidence';
  if (/react|python|node|swift|kotlin|typescript|design|figma|ml|llm/i.test(lower)) return 'skill';
  return 'literal';
}

function defaultEvidenceFields(mode: CompiledRequirement['mode']): SearchPlanEvidenceField[] {
  switch (mode) {
    case 'school':
      return ['education.school', 'education.field', 'headline', 'bio'];
    case 'category':
      return ['experiences.company', 'experiences.title', 'experiences.description', 'headline', 'bio'];
    case 'project_evidence':
      return ['projects', 'headline', 'bio', 'skills'];
    case 'skill':
      return ['skills', 'rolePreference', 'projects', 'experiences.description', 'headline'];
    default:
      return [...EVIDENCE_FIELDS];
  }
}

/** Lexical fallback when OpenRouter is unavailable — no hardcoded company lists. */
export function buildFallbackSearchPlan(opportunity: any): SearchPlan {
  const requirements = getSearchRequirements(opportunity);
  const compiled = requirements.map((requirement) => {
    const mode = inferMode(requirement.text);
    const tokens = norm(requirement.text)
      .replace(/[^a-z0-9+#.\s-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'been'].includes(token));

    return {
      text: requirement.text,
      importance: requirement.importance,
      mode,
      matchAnyOf: uniqueStrings([requirement.text, ...tokens], 16),
      matchHints: tokens.slice(0, 6),
      evidenceFields: defaultEvidenceFields(mode),
      retrievalTerms: uniqueStrings([requirement.text, ...tokens.slice(0, 8)], 12),
      rationale: 'Fallback lexical expansion (LLM compile unavailable).',
    } satisfies CompiledRequirement;
  });

  return {
    version: 1,
    sourceHash: hashSearchRequirements(requirements),
    compiledAt: new Date().toISOString(),
    requirements: compiled,
    retrievalTerms: uniqueStrings(compiled.flatMap((item) => item.retrievalTerms), 40),
    compiledBy: 'fallback',
  };
}

function sanitizeCompiledRequirement(
  raw: any,
  fallback: SearchRequirement
): CompiledRequirement {
  const mode = (['literal', 'category', 'skill', 'project_evidence', 'school', 'other'] as const).includes(raw?.mode)
    ? raw.mode
    : inferMode(fallback.text);

  const matchAnyOf = uniqueStrings(
    [
      ...(Array.isArray(raw?.matchAnyOf) ? raw.matchAnyOf : []),
      fallback.text,
    ].map((value) => String(value || '').slice(0, 80)),
    24
  );

  const matchHints = uniqueStrings(
    (Array.isArray(raw?.matchHints) ? raw.matchHints : []).map((value: unknown) => String(value || '').slice(0, 60)),
    12
  );

  const evidenceFields = (Array.isArray(raw?.evidenceFields) ? raw.evidenceFields : [])
    .map((field: unknown) => String(field || ''))
    .filter((field: string): field is SearchPlanEvidenceField =>
      EVIDENCE_FIELDS.includes(field as SearchPlanEvidenceField)
    );

  const retrievalTerms = uniqueStrings(
    [
      ...(Array.isArray(raw?.retrievalTerms) ? raw.retrievalTerms : []),
      ...matchAnyOf.slice(0, 12),
      fallback.text,
    ].map((value) => String(value || '').slice(0, 64)),
    16
  );

  return {
    text: fallback.text,
    importance: fallback.importance,
    mode,
    matchAnyOf,
    matchHints,
    evidenceFields: evidenceFields.length ? evidenceFields : defaultEvidenceFields(mode),
    retrievalTerms,
    rationale: String(raw?.rationale || '').slice(0, 200) || 'Compiled from founder requirement.',
  };
}

/**
 * One LLM call: expand natural-language founder requirements into match tokens + retrieval terms.
 * Cached on the job via sourceHash until requirements change.
 */
export async function compileSearchPlan(opportunity: any): Promise<SearchPlan> {
  const requirements = getSearchRequirements(opportunity);
  if (!requirements.length) {
    return {
      version: 1,
      sourceHash: hashSearchRequirements([]),
      compiledAt: new Date().toISOString(),
      requirements: [],
      retrievalTerms: [],
      compiledBy: 'fallback',
    };
  }

  const cached = getCachedSearchPlan(opportunity);
  if (cached) return cached;

  if (!hasOpenRouterConfig()) {
    return buildFallbackSearchPlan(opportunity);
  }

  const systemPrompt = `You compile founder hiring preferences into a machine-checkable search plan.
For each requirement, expand vague categories into concrete match tokens that can be found in builder profiles (companies, schools, skills, project phrases).
Rules:
- matchAnyOf: OR list of lowercase-friendly tokens/phrases. If ANY appears in profile evidence, the requirement is met.
- For categories like "big tech", "FAANG", "top startup", "YC company", expand to a broad but reasonable set of real company names (15-25 for big categories). Do not invent fake companies.
- For schools ("Ivy League", "top CS school"), expand to concrete school names.
- For project evidence ("built a chat feature"), use concrete phrases and related tech tokens.
- retrievalTerms: short terms useful for keyword/semantic retrieval (company names, school names, skill tokens). Prefer specific over vague.
- evidenceFields: which profile areas to check. Use only: experiences.company, experiences.title, experiences.description, education.school, education.field, headline, bio, skills, rolePreference, projects.
- mode: literal | category | skill | project_evidence | school | other
- Do not drop the original requirement text from matchAnyOf/retrievalTerms.
Return ONLY valid JSON: {"requirements":[{"text":"...","mode":"...","matchAnyOf":["..."],"matchHints":["..."],"evidenceFields":["..."],"retrievalTerms":["..."],"rationale":"..."}]}`;

  const userPrompt = JSON.stringify({
    roleTitle: opportunity.roleTitle || opportunity.title || null,
    builderWillDo: opportunity.builderWillDo || opportunity.description || null,
    skillsNeeded: (opportunity.skillsNeeded || []).slice(0, 12),
    requirements: requirements.map((requirement) => ({
      text: requirement.text,
      importance: requirement.importance,
    })),
  });

  try {
    const reply = await generateOpenRouterReply({
      systemPrompt,
      userPrompt,
      temperature: 0,
      maxTokens: 1800,
      responseFormat: 'json_object',
    });
    const json = reply.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json);
    const byText = new Map<string, any>();
    for (const item of Array.isArray(parsed?.requirements) ? parsed.requirements : []) {
      const text = String(item?.text || '').trim().toLowerCase();
      if (text) byText.set(text, item);
    }

    const compiled = requirements.map((requirement) =>
      sanitizeCompiledRequirement(byText.get(requirement.text.toLowerCase()), requirement)
    );

    return {
      version: 1,
      sourceHash: hashSearchRequirements(requirements),
      compiledAt: new Date().toISOString(),
      requirements: compiled,
      retrievalTerms: uniqueStrings(compiled.flatMap((item) => item.retrievalTerms), 40),
      compiledBy: 'llm',
    };
  } catch (error) {
    console.warn(
      '[searchPlan] compile failed, using fallback',
      error instanceof Error ? error.message : error
    );
    return buildFallbackSearchPlan(opportunity);
  }
}

export function getPlanRetrievalTerms(plan: SearchPlan | null | undefined): string[] {
  if (!plan) return [];
  return uniqueStrings(plan.retrievalTerms || [], 40);
}
