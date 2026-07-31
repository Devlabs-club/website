import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import { getSearchRequirements, type SearchRequirement } from '@/lib/talent/searchTokens';
import {
  buildFallbackEvidenceDimensions,
  inferRoleFamily,
  sanitizeEvidenceDimensions,
  type PlannedEvidenceDimension,
  type RoleFamily,
} from '@/lib/talent/roleEvidenceDimensions';

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
  /** Deterministic requirement checks that must not be narrowed by model output. */
  predicate?: 'internship_experience' | 'work_experience' | 'project_experience' | 'role_relevance' | null;
};

export type RoleEvidencePlan = {
  /** Role concepts that require project or experience evidence, never skills alone. */
  anchorConcepts: string[];
  /** Helpful concepts that strengthen anchored evidence but cannot qualify a candidate alone. */
  supportingConcepts: string[];
  minimumAnchorMatches: number;
  minimumTotalMatches: number;
};

/**
 * Role-shaped search plan.
 * version 3 adds roleFamily + evidenceDimensions so ranking is custom per role
 * while still using one discovery engine.
 */
export type SearchPlan = {
  version: 3;
  sourceHash: string;
  compiledAt: string;
  roleFamily: RoleFamily;
  /** Weighted evidence dimensions that drive ranking + reason-to-hire. */
  evidenceDimensions: PlannedEvidenceDimension[];
  requirements: CompiledRequirement[];
  roleEvidence: RoleEvidencePlan;
  /** Flattened retrieval terms across requirements + dimensions. */
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

const ROLE_FAMILIES: RoleFamily[] = [
  'builder',
  'teacher_advocate',
  'researcher',
  'designer',
  'operator',
  'hybrid',
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

/** Stable hash of JD + requirements so we recompile when role shape changes. */
export function hashSearchRequirements(
  requirements: SearchRequirement[],
  opportunity?: any
): string {
  const payload = [
    ...requirements.map((requirement) => `${requirement.importance}:${norm(requirement.text)}`),
    `role:${norm(String(opportunity?.roleTitle || opportunity?.title || ''))}`,
    `will:${norm(String(opportunity?.builderWillDo || opportunity?.description || '').slice(0, 240))}`,
    `skills:${(opportunity?.skillsNeeded || []).map((skill: string) => norm(String(skill || ''))).join(',')}`,
  ]
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
  if (!plan || !Array.isArray(plan.requirements)) return null;
  const requirements = getSearchRequirements(opportunity);
  const nextHash = hashSearchRequirements(requirements, opportunity);

  // Exact v3 hit.
  if (
    plan.version === 3 &&
    Array.isArray(plan.evidenceDimensions) &&
    plan.evidenceDimensions.length &&
    plan.sourceHash === nextHash
  ) {
    return plan as SearchPlan;
  }

  // Soft-upgrade reusable plans (v2 or stale hash) without an LLM round-trip when
  // requirement texts still match. Keeps search fast after schema bumps.
  const requirementTextsMatch =
    plan.requirements.length === requirements.length &&
    requirements.every((requirement) =>
      plan.requirements.some(
        (item: any) =>
          String(item?.text || '').trim().toLowerCase() === requirement.text.toLowerCase() &&
          String(item?.importance || 'nice') === requirement.importance
      )
    );

  if (!requirementTextsMatch && plan.sourceHash !== nextHash) return null;

  const roleFamily = sanitizeRoleFamily(plan.roleFamily, opportunity);
  const evidenceDimensions =
    Array.isArray(plan.evidenceDimensions) && plan.evidenceDimensions.length
      ? sanitizeEvidenceDimensions(plan.evidenceDimensions, opportunity, roleFamily)
      : buildFallbackEvidenceDimensions(opportunity, roleFamily);
  const roleEvidence = sanitizeRoleEvidence(plan.roleEvidence, opportunity);
  const compiled = requirements.map((requirement) => {
    const raw = plan.requirements.find(
      (item: any) => String(item?.text || '').trim().toLowerCase() === requirement.text.toLowerCase()
    );
    return sanitizeCompiledRequirement(raw, requirement);
  });

  return {
    version: 3,
    roleFamily,
    evidenceDimensions,
    roleEvidence,
    sourceHash: nextHash,
    compiledAt: plan.compiledAt || new Date().toISOString(),
    requirements: compiled,
    retrievalTerms: collectRetrievalTerms(compiled, evidenceDimensions, roleEvidence),
    compiledBy: plan.compiledBy === 'llm' ? 'llm' : 'fallback',
  };
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

function requirementPredicate(text: string): CompiledRequirement['predicate'] {
  const lower = text.toLowerCase();
  if (/\bintern(ship)?\b|\bco[-\s]?op\b/.test(lower)) return 'internship_experience';
  if (/\b(previous|prior|past)\b.*\bwork experience\b|\bprofessional experience\b/.test(lower)) return 'work_experience';
  if (/\b(previous|prior|past)\b.*\bprojects?\b|\bproject experience\b/.test(lower)) return 'project_experience';
  if (/\brelevant\b.*\b(experiences?|background|work|projects?)\b/.test(lower)) return 'role_relevance';
  return null;
}

function sanitizeRoleFamily(raw: unknown, opportunity: any): RoleFamily {
  const value = String(raw || '') as RoleFamily;
  if (ROLE_FAMILIES.includes(value)) return value;
  return inferRoleFamily(opportunity);
}

function collectRetrievalTerms(
  requirements: CompiledRequirement[],
  dimensions: PlannedEvidenceDimension[],
  roleEvidence: RoleEvidencePlan
): string[] {
  return uniqueStrings(
    [
      ...requirements.flatMap((item) => item.retrievalTerms),
      ...dimensions.flatMap((item) => item.retrievalTerms),
      ...dimensions.flatMap((item) => item.matchAnyOf.slice(0, 6)),
      ...(roleEvidence.anchorConcepts || []),
      ...(roleEvidence.supportingConcepts || []),
    ],
    48
  );
}

/** Lexical fallback when OpenRouter is unavailable — no hardcoded company lists. */
export function buildFallbackSearchPlan(opportunity: any): SearchPlan {
  const requirements = getSearchRequirements(opportunity);
  const roleFamily = inferRoleFamily(opportunity);
  const evidenceDimensions = buildFallbackEvidenceDimensions(opportunity, roleFamily);
  const compiled = requirements.map((requirement) => {
    const mode = inferMode(requirement.text);
    const tokens = norm(requirement.text)
      .replace(/[^a-z0-9+#.\s-]/g, ' ')
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 3 &&
          !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'been'].includes(token)
      );

    return {
      text: requirement.text,
      importance: requirement.importance,
      mode,
      matchAnyOf: uniqueStrings([requirement.text, ...tokens], 16),
      matchHints: tokens.slice(0, 6),
      evidenceFields: defaultEvidenceFields(mode),
      retrievalTerms: uniqueStrings([requirement.text, ...tokens.slice(0, 8)], 12),
      rationale: 'Fallback lexical expansion (LLM compile unavailable).',
      predicate: requirementPredicate(requirement.text),
    } satisfies CompiledRequirement;
  });

  const roleEvidence = sanitizeRoleEvidence(
    {
      anchorConcepts: [opportunity?.roleTitle, ...(opportunity?.skillsNeeded || [])],
      supportingConcepts: opportunity?.skillsNeeded || [],
      minimumAnchorMatches: 1,
      minimumTotalMatches: 2,
    },
    opportunity
  );

  return {
    version: 3,
    roleFamily,
    evidenceDimensions,
    roleEvidence,
    sourceHash: hashSearchRequirements(requirements, opportunity),
    compiledAt: new Date().toISOString(),
    requirements: compiled,
    retrievalTerms: collectRetrievalTerms(compiled, evidenceDimensions, roleEvidence),
    compiledBy: 'fallback',
  };
}

function sanitizeCompiledRequirement(
  raw: any,
  fallback: SearchRequirement
): CompiledRequirement {
  const mode = (['literal', 'category', 'skill', 'project_evidence', 'school', 'other'] as const).includes(
    raw?.mode
  )
    ? raw.mode
    : inferMode(fallback.text);

  const matchAnyOf = uniqueStrings(
    [...(Array.isArray(raw?.matchAnyOf) ? raw.matchAnyOf : []), fallback.text].map((value) =>
      String(value || '').slice(0, 80)
    ),
    24
  );

  const matchHints = uniqueStrings(
    (Array.isArray(raw?.matchHints) ? raw.matchHints : []).map((value: unknown) =>
      String(value || '').slice(0, 60)
    ),
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
    predicate: requirementPredicate(fallback.text),
  };
}

function sanitizeRoleEvidence(raw: any, opportunity: any): RoleEvidencePlan {
  const rawAnchors = uniqueStrings(
    [
      ...(Array.isArray(raw?.anchorConcepts) ? raw.anchorConcepts : [opportunity?.roleTitle]),
      ...(opportunity?.skillsNeeded || []),
    ].map((value: unknown) => String(value || '').slice(0, 80)),
    20
  );
  const genericLanguages = new Set([
    'c',
    'c++',
    'c#',
    'java',
    'python',
    'javascript',
    'typescript',
    'go',
    'ruby',
    'php',
    'rust',
  ]);
  const anchors = rawAnchors.filter((term) => !genericLanguages.has(norm(term)));
  const supportingConcepts = uniqueStrings(
    (Array.isArray(raw?.supportingConcepts) ? raw.supportingConcepts : opportunity?.skillsNeeded || []).map(
      (value: unknown) => String(value || '').slice(0, 80)
    ),
    20
  )
    .concat(rawAnchors.filter((term) => genericLanguages.has(norm(term))))
    .filter(
      (term, index, all) =>
        !anchors.some((anchor) => norm(anchor) === norm(term)) &&
        all.findIndex((value) => norm(value) === norm(term)) === index
    );
  return {
    anchorConcepts: anchors,
    supportingConcepts,
    minimumAnchorMatches: Math.max(1, Math.min(3, Number(raw?.minimumAnchorMatches) || 1)),
    minimumTotalMatches: Math.max(1, Math.min(5, Number(raw?.minimumTotalMatches) || 2)),
  };
}

/**
 * One LLM call: classify the role, pick weighted evidence dimensions, and expand
 * founder requirements into match tokens + retrieval terms.
 * Cached on the job via sourceHash until the JD/requirements change.
 */
export async function compileSearchPlan(opportunity: any): Promise<SearchPlan> {
  const requirements = getSearchRequirements(opportunity);
  const cached = getCachedSearchPlan(opportunity);
  if (cached) return cached;

  if (!hasOpenRouterConfig()) {
    return buildFallbackSearchPlan(opportunity);
  }

  const systemPrompt = `You compile a role-shaped hiring search plan.
Return ONE JSON object with:
1) roleFamily: one of builder | teacher_advocate | researcher | designer | operator | hybrid
2) evidenceDimensions: 4-6 items from this FIXED catalog only:
   ship_proof, teaching, community, oss_packages, domain_depth, design_craft, growth_experiments, systems_depth, research_depth, stack_fit
   Each item: {id, label, weight, matchAnyOf[], retrievalTerms[], rationale}
   Weights must be positive and roughly sum to 1.0. Choose dimensions that prove success for THIS role (outcomes), not generic resume keywords.
   Examples:
   - DevRel/advocate -> teaching, community, oss_packages, ship_proof, domain_depth
   - Founding/full-stack engineer -> ship_proof, stack_fit, systems_depth, domain_depth
   - ML/RAG engineer -> domain_depth, research_depth, ship_proof, stack_fit
   - Designer -> design_craft, ship_proof, domain_depth
3) roleEvidence: {anchorConcepts[], supportingConcepts[], minimumAnchorMatches, minimumTotalMatches}
   anchorConcepts prove relevant work only in experience/projects. supportingConcepts never qualify alone.
4) requirements: expand each founder requirement into match tokens.
Rules for requirements:
- matchAnyOf: OR list of concrete tokens/phrases found in profiles. If ANY appears, requirement is met.
- For categories like "big tech"/"FAANG"/"YC", expand to real company names (15-25). Do not invent companies.
- For schools, expand to concrete school names.
- For project evidence, use concrete phrases and related tech tokens.
- retrievalTerms: short keyword/semantic retrieval terms. Prefer specific over vague.
- evidenceFields: only experiences.company, experiences.title, experiences.description, education.school, education.field, headline, bio, skills, rolePreference, projects
- mode: literal | category | skill | project_evidence | school | other
- Never drop original requirement text from matchAnyOf/retrievalTerms.
- Never narrow an explicit founder requirement.
Return ONLY valid JSON.`;

  const userPrompt = JSON.stringify({
    roleTitle: opportunity.roleTitle || opportunity.title || null,
    builderWillDo: opportunity.builderWillDo || opportunity.description || null,
    skillsNeeded: (opportunity.skillsNeeded || []).slice(0, 12),
    industry: opportunity.industry || null,
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
      maxTokens: 2200,
      responseFormat: 'json_object',
    });
    const json = reply.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json);
    const byText = new Map<string, any>();
    for (const item of Array.isArray(parsed?.requirements) ? parsed.requirements : []) {
      const text = String(item?.text || '')
        .trim()
        .toLowerCase();
      if (text) byText.set(text, item);
    }

    const roleFamily = sanitizeRoleFamily(parsed?.roleFamily, opportunity);
    const evidenceDimensions = sanitizeEvidenceDimensions(
      parsed?.evidenceDimensions,
      opportunity,
      roleFamily
    );
    const compiled = requirements.map((requirement) =>
      sanitizeCompiledRequirement(byText.get(requirement.text.toLowerCase()), requirement)
    );
    const roleEvidence = sanitizeRoleEvidence(parsed?.roleEvidence, opportunity);

    return {
      version: 3,
      roleFamily,
      evidenceDimensions,
      roleEvidence,
      sourceHash: hashSearchRequirements(requirements, opportunity),
      compiledAt: new Date().toISOString(),
      requirements: compiled,
      retrievalTerms: collectRetrievalTerms(compiled, evidenceDimensions, roleEvidence),
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
  return uniqueStrings(
    [
      ...(plan.retrievalTerms || []),
      ...(plan.roleEvidence?.anchorConcepts || []),
      ...(plan.roleEvidence?.supportingConcepts || []),
      ...(plan.evidenceDimensions || []).flatMap((dimension) => [
        ...dimension.retrievalTerms,
        ...dimension.matchAnyOf.slice(0, 4),
      ]),
    ],
    48
  );
}

export function getPlanEvidenceDimensions(
  plan: SearchPlan | null | undefined
): PlannedEvidenceDimension[] {
  if (!plan?.evidenceDimensions?.length) return [];
  return plan.evidenceDimensions;
}
