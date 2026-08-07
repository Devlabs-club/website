/**
 * Role-shaped evidence dimensions: a fixed catalog the search-plan compiler
 * selects and weights per role. One scoring engine; many role plans.
 */

import { expandDomainProofTerms } from '@/lib/talent/roleEvidenceDossier';

export const EVIDENCE_DIMENSION_IDS = [
  'ship_proof',
  'teaching',
  'community',
  'oss_packages',
  'domain_depth',
  'design_craft',
  'growth_experiments',
  'systems_depth',
  'research_depth',
  'stack_fit',
] as const;

export type EvidenceDimensionId = (typeof EVIDENCE_DIMENSION_IDS)[number];

export type RoleFamily =
  | 'builder'
  | 'teacher_advocate'
  | 'researcher'
  | 'designer'
  | 'operator'
  | 'specialist'
  | 'hybrid';

export type PlannedEvidenceDimension = {
  id: EvidenceDimensionId;
  label: string;
  weight: number;
  /** Tokens/phrases that score this dimension when found in profile evidence. */
  matchAnyOf: string[];
  retrievalTerms: string[];
  rationale: string;
};

export type DimensionHit = {
  id: EvidenceDimensionId;
  label: string;
  score: number;
  weight: number;
  evidence: string[];
};

export type RoleDimensionScore = {
  overall: number;
  hits: DimensionHit[];
  /** Top dimensions that should drive the hire reason. */
  winningHits: DimensionHit[];
};

const DIMENSION_LABELS: Record<EvidenceDimensionId, string> = {
  ship_proof: 'Shipped product proof',
  teaching: 'Teaching & content',
  community: 'Community & events',
  oss_packages: 'Open-source & packages',
  domain_depth: 'Domain depth',
  design_craft: 'Design craft',
  growth_experiments: 'Growth experiments',
  systems_depth: 'Systems depth',
  research_depth: 'Research depth',
  stack_fit: 'Stack fit',
};

/** Default lexical signals when the plan does not expand a dimension. */
const DIMENSION_DEFAULTS: Record<EvidenceDimensionId, string[]> = {
  ship_proof: [
    'shipped',
    'deployed',
    'launched',
    'production',
    'demo',
    'mvp',
    'users',
    'live',
    'vercel',
    'app store',
  ],
  teaching: [
    'mentor',
    'tutoring',
    'tutor',
    'teaching assistant',
    'workshop',
    'tutorial',
    'blog',
    'speaker',
    'docs',
    'documentation',
    'course',
    'newsletter',
    'section leader',
  ],
  community: [
    'hackathon',
    'community',
    'organizer',
    'ambassador',
    'campus',
    'soda',
    'devrel',
    'developer advocate',
    'developer relations',
    'meetup',
    'club',
    'society',
    'discord',
  ],
  oss_packages: [
    'open source',
    'opensource',
    'maintainer',
    'contributor',
    'npm',
    'pypi',
    'package',
    'sdk',
    'library',
    'github.com',
  ],
  domain_depth: [],
  design_craft: [
    'figma',
    'design system',
    'ux',
    'ui design',
    'prototype',
    'wireframe',
    'visual design',
    'product design',
    'interaction design',
  ],
  growth_experiments: [
    'growth',
    'acquisition',
    'retention',
    'funnel',
    'a/b test',
    'experiment',
    'conversion',
    'seo',
    'activation',
    'metrics',
  ],
  systems_depth: [
    'distributed',
    'infrastructure',
    'scalability',
    'latency',
    'throughput',
    'kubernetes',
    'terraform',
    'observability',
    'microservices',
    'ci/cd',
  ],
  research_depth: [
    'research',
    'paper',
    'arxiv',
    'publication',
    'benchmark',
    'dataset',
    'experiment',
    'lab',
    'thesis',
  ],
  stack_fit: [],
};

const FAMILY_PRESETS: Record<RoleFamily, Array<{ id: EvidenceDimensionId; weight: number }>> = {
  teacher_advocate: [
    { id: 'teaching', weight: 0.26 },
    { id: 'community', weight: 0.2 },
    { id: 'oss_packages', weight: 0.16 },
    { id: 'ship_proof', weight: 0.14 },
    { id: 'domain_depth', weight: 0.14 },
    { id: 'stack_fit', weight: 0.1 },
  ],
  builder: [
    { id: 'ship_proof', weight: 0.26 },
    { id: 'stack_fit', weight: 0.2 },
    { id: 'domain_depth', weight: 0.18 },
    { id: 'systems_depth', weight: 0.14 },
    { id: 'oss_packages', weight: 0.12 },
    { id: 'community', weight: 0.1 },
  ],
  researcher: [
    { id: 'research_depth', weight: 0.28 },
    { id: 'domain_depth', weight: 0.24 },
    { id: 'ship_proof', weight: 0.16 },
    { id: 'oss_packages', weight: 0.12 },
    { id: 'stack_fit', weight: 0.12 },
    { id: 'teaching', weight: 0.08 },
  ],
  designer: [
    { id: 'design_craft', weight: 0.34 },
    { id: 'ship_proof', weight: 0.22 },
    { id: 'domain_depth', weight: 0.14 },
    { id: 'growth_experiments', weight: 0.12 },
    { id: 'community', weight: 0.1 },
    { id: 'stack_fit', weight: 0.08 },
  ],
  operator: [
    { id: 'growth_experiments', weight: 0.28 },
    { id: 'ship_proof', weight: 0.2 },
    { id: 'community', weight: 0.16 },
    { id: 'domain_depth', weight: 0.14 },
    { id: 'systems_depth', weight: 0.12 },
    { id: 'stack_fit', weight: 0.1 },
  ],
  specialist: [
    { id: 'domain_depth', weight: 0.34 },
    { id: 'systems_depth', weight: 0.16 },
    { id: 'ship_proof', weight: 0.14 },
    { id: 'stack_fit', weight: 0.14 },
    { id: 'research_depth', weight: 0.12 },
    { id: 'oss_packages', weight: 0.1 },
  ],
  hybrid: [
    { id: 'ship_proof', weight: 0.22 },
    { id: 'domain_depth', weight: 0.18 },
    { id: 'stack_fit', weight: 0.16 },
    { id: 'oss_packages', weight: 0.14 },
    { id: 'teaching', weight: 0.1 },
    { id: 'community', weight: 0.1 },
    { id: 'systems_depth', weight: 0.1 },
  ],
};

/** Tokens that belong to ship/growth defaults — never score as domain_depth alone. */
export const CROSS_DIMENSION_NOISE = new Set(
  [
    ...DIMENSION_DEFAULTS.ship_proof,
    ...DIMENSION_DEFAULTS.growth_experiments,
  ].map((token) => token.toLowerCase())
);

/** Ultra-generic atoms that cannot qualify domain_depth / category musts alone. */
export const GENERIC_DOMAIN_ATOMS = new Set([
  'operating',
  'systems',
  'computer',
  'networks',
  'network',
  'python',
  'java',
  'javascript',
  'typescript',
  'technology',
  'information',
  'software',
  'engineer',
  'developer',
  'programming',
  'code',
  'coding',
  'data',
  'app',
  'application',
  'web',
  'tools',
  'tool',
  'skills',
  'skill',
  'experience',
  'previous',
  'background',
]);

const STACK_LANGUAGE_TOKENS = new Set([
  'c',
  'c++',
  'c#',
  'java',
  'python',
  'javascript',
  'typescript',
  'go',
  'rust',
  'ruby',
  'php',
  'kotlin',
  'swift',
  'scala',
]);

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

export function isEvidenceDimensionId(value: unknown): value is EvidenceDimensionId {
  return EVIDENCE_DIMENSION_IDS.includes(String(value || '') as EvidenceDimensionId);
}

export function inferRoleFamily(opportunity: any): RoleFamily {
  const blob = norm(
    [
      opportunity?.roleTitle,
      opportunity?.title,
      opportunity?.builderWillDo,
      opportunity?.description,
      ...(opportunity?.skillsNeeded || []),
    ]
      .filter(Boolean)
      .join(' ')
  );

  // Domain specialists before builder/operator heuristics — Ethical Hacker must
  // not fall through to growth-weighted "operator".
  if (
    /cyber\s*sec|infosec|information\s*security|ethical\s*hack|penetration\s*test|pen\s*test|pentest|\bsoc\b|app\s*sec|application\s*security|product\s*security|red\s*team|blue\s*team|malware|reverse\s*engineer|vulnerability|bug\s*bounty|\bctf\b|firmware|embedded|robotics|mechatronics|hardware|fpga|asic|avionics|quant(itative)?|computational\s*biology|bioinformatics|cryptograph/.test(
      blob
    )
  ) {
    return 'specialist';
  }

  // Explicit role-family phrases win over generic "engineer/developer" in the title.
  if (
    /devrel|developer relations|developer advocate|advocate|community engineer|developer experience|\bdx\b|evangelist|campus ambassador|technical writer|docs engineer/.test(
      blob
    )
  ) {
    return 'teacher_advocate';
  }
  if (/\b(product )?design(er)?\b|ux\b|ui\/ux|figma|visual design/.test(blob)) {
    return 'designer';
  }
  if (/research(er)?|scientist|phd|ml research|applied research/.test(blob)) {
    return 'researcher';
  }
  if (/growth|marketing|gtm|operations|community manager|product ops/.test(blob)) {
    return 'operator';
  }

  const teacher = /educator|mentor|workshop|tutorial|hackathon organizer/.test(blob);
  const builder =
    /engineer|developer|full[\s-]?stack|backend|frontend|founding|software|sde|swe|mobile|ios|android/.test(
      blob
    );

  if (teacher && builder) return 'hybrid';
  if (teacher) return 'teacher_advocate';
  if (builder) return 'builder';
  return 'hybrid';
}

/** Keep domain_depth / category tokens from absorbing ship, stack, or generic atoms. */
export function sanitizeDomainTokens(tokens: string[], options?: { allowStackLanguages?: boolean }): string[] {
  const allowStack = options?.allowStackLanguages === true;
  const knownShortDomainAtoms = new Set([
    'soc',
    'ctf',
    'siem',
    'cve',
    'ids',
    'ips',
    'fpga',
    'asic',
    'pcb',
    'rtl',
    'llm',
    'rag',
    'nlp',
  ]);
  return uniqueStrings(
    tokens.filter((token) => {
      const key = norm(token);
      if (!key || key.length < 3) return false;
      if (CROSS_DIMENSION_NOISE.has(key)) return false;
      if (GENERIC_DOMAIN_ATOMS.has(key)) return false;
      if (!allowStack && STACK_LANGUAGE_TOKENS.has(key)) return false;
      // Phrases built only from stack/generic atoms (e.g. "operating systems") are not domain.
      const parts = key.split(/\s+/).filter(Boolean);
      if (
        parts.length >= 2 &&
        parts.every(
          (part) =>
            GENERIC_DOMAIN_ATOMS.has(part) ||
            (!allowStack && STACK_LANGUAGE_TOKENS.has(part)) ||
            part.length < 3
        )
      ) {
        return false;
      }
      // Prefer phrases; allow known short domain atoms and longer single words.
      if (!key.includes(' ') && key.length < 5 && !knownShortDomainAtoms.has(key)) return false;
      return true;
    }),
    24
  );
}

function domainTokensFromOpportunity(opportunity: any): string[] {
  // Prefer role title / industry / must text over skillsNeeded stack lists.
  const mustTexts = [
    ...(opportunity?.searchRequirements || []),
    ...(opportunity?.requirements || []),
  ]
    .map((entry: any) => (typeof entry === 'string' ? entry : entry?.text))
    .filter(Boolean);

  return uniqueStrings(
    [opportunity?.roleTitle, opportunity?.title, opportunity?.industry, ...mustTexts]
      .flatMap((value) =>
        String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9+#.\s-]/g, ' ')
          .split(/\s+/)
          .filter((token) => token.length >= 3)
      )
      .filter(
        (token) =>
          ![
            'the',
            'and',
            'for',
            'with',
            'engineer',
            'developer',
            'software',
            'role',
            'intern',
            'previous',
            'experience',
            'completed',
            'currently',
            'enrolled',
            'college',
          ].includes(token)
      ),
    16
  );
}

function specialistDomainSeeds(opportunity: any): string[] {
  // Expand domain vocab from title / description / musts — not from stack skills.
  const mustTexts = [
    ...(opportunity?.searchRequirements || []),
    ...(opportunity?.requirements || []),
  ]
    .map((entry: any) => (typeof entry === 'string' ? entry : entry?.text))
    .filter(Boolean);

  const seeds = [
    opportunity?.roleTitle,
    opportunity?.title,
    opportunity?.builderWillDo,
    opportunity?.industry,
    ...mustTexts,
  ];
  return sanitizeDomainTokens(expandDomainProofTerms(seeds));
}

/** Build a dimension plan from role family + JD when LLM is unavailable. */
export function buildFallbackEvidenceDimensions(
  opportunity: any,
  roleFamily?: RoleFamily
): PlannedEvidenceDimension[] {
  const family = roleFamily || inferRoleFamily(opportunity);
  const domainTokens = sanitizeDomainTokens([
    ...domainTokensFromOpportunity(opportunity),
    ...specialistDomainSeeds(opportunity),
  ]);
  const stackTokens = uniqueStrings(
    (opportunity?.skillsNeeded || []).map((skill: string) => String(skill || '').trim()),
    12
  );

  return FAMILY_PRESETS[family].map((preset) => {
    const defaults = DIMENSION_DEFAULTS[preset.id];
    let matchAnyOf = [...defaults];
    if (preset.id === 'domain_depth') {
      matchAnyOf = uniqueStrings([...matchAnyOf, ...domainTokens], 20);
    } else if (preset.id === 'stack_fit') {
      matchAnyOf = uniqueStrings([...matchAnyOf, ...stackTokens], 20);
    }
    return {
      id: preset.id,
      label: DIMENSION_LABELS[preset.id],
      weight: preset.weight,
      matchAnyOf,
      retrievalTerms: uniqueStrings(
        [
          ...matchAnyOf.slice(0, 10),
          ...(preset.id === 'domain_depth' ? domainTokens.slice(0, 6) : []),
          ...(preset.id === 'stack_fit' ? stackTokens.slice(0, 6) : []),
        ],
        14
      ),
      rationale: `Fallback ${family} preset for ${preset.id}.`,
    };
  });
}

export function sanitizeEvidenceDimensions(
  raw: unknown,
  opportunity: any,
  roleFamily?: RoleFamily
): PlannedEvidenceDimension[] {
  const family = roleFamily || inferRoleFamily(opportunity);
  const fallback = buildFallbackEvidenceDimensions(opportunity, family);
  const rawList = Array.isArray(raw) ? raw : [];
  const otherDefaultTokens = new Map<EvidenceDimensionId, Set<string>>();
  for (const id of EVIDENCE_DIMENSION_IDS) {
    otherDefaultTokens.set(
      id,
      new Set(
        EVIDENCE_DIMENSION_IDS.filter((other) => other !== id)
          .flatMap((other) => DIMENSION_DEFAULTS[other] || [])
          .map((token) => token.toLowerCase())
      )
    );
  }

  const parsed: PlannedEvidenceDimension[] = [];
  for (const item of rawList) {
    const id = String((item as any)?.id || '');
    if (!isEvidenceDimensionId(id)) continue;
    const weight = Number((item as any)?.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const foreignDefaults = otherDefaultTokens.get(id) || new Set();
    let matchAnyOf = uniqueStrings(
      [
        ...((item as any)?.matchAnyOf || []),
        ...(DIMENSION_DEFAULTS[id] || []),
        ...(id === 'domain_depth'
          ? [...domainTokensFromOpportunity(opportunity), ...specialistDomainSeeds(opportunity)]
          : []),
        ...(id === 'stack_fit' ? (opportunity?.skillsNeeded || []) : []),
      ].map((value) => String(value || '').slice(0, 80)),
      28
    ).filter((token) => {
      const key = norm(token);
      if (!key) return false;
      // Do not let ship/growth/teaching defaults pollute unrelated dimensions.
      if (id !== 'ship_proof' && id !== 'growth_experiments' && CROSS_DIMENSION_NOISE.has(key) && id === 'domain_depth') {
        return false;
      }
      if (foreignDefaults.has(key) && id === 'domain_depth') return false;
      return true;
    });

    if (id === 'domain_depth') {
      matchAnyOf = sanitizeDomainTokens(matchAnyOf);
    }

    parsed.push({
      id,
      label: String((item as any)?.label || DIMENSION_LABELS[id]).slice(0, 80),
      weight,
      matchAnyOf,
      retrievalTerms: uniqueStrings(
        [
          ...((item as any)?.retrievalTerms || []),
          ...matchAnyOf.slice(0, 10),
        ]
          .map((value) => String(value || '').slice(0, 64))
          .filter((token) => {
            if (id !== 'domain_depth') return true;
            return sanitizeDomainTokens([token]).length > 0;
          }),
        16
      ),
      rationale: String((item as any)?.rationale || '').slice(0, 200) || `Selected for ${family}.`,
    });
  }

  const dimensions = (parsed.length >= 3 ? parsed : fallback).slice(0, 7);
  const weightSum = dimensions.reduce((sum, item) => sum + item.weight, 0) || 1;
  return dimensions.map((item) => ({
    ...item,
    weight: Math.round((item.weight / weightSum) * 1000) / 1000,
  }));
}

function buildEvidenceBlob(builder: any, projects: any[]): string {
  return [
    builder?.name,
    builder?.headline,
    builder?.bio,
    builder?.universityOrCompany,
    ...(builder?.skills || []),
    ...(builder?.rolePreference || []),
    ...(builder?.experiences || []).flatMap((experience: any) => [
      experience?.title,
      experience?.company,
      experience?.description,
      ...(experience?.skills || []),
    ]),
    ...(builder?.education || []).flatMap((education: any) => [
      education?.school,
      education?.degree,
      education?.field,
    ]),
    ...(builder?.enrichmentInsights?.founderHighlights || []).flatMap((highlight: any) => [
      highlight?.title,
      highlight?.detail,
    ]),
    ...(projects || []).flatMap((project: any) => [
      project?.projectName,
      project?.description,
      project?.problemSolved,
      project?.builderContribution,
      ...(project?.techStack || []),
      ...(project?.contributionTags || []),
      project?.links?.github,
      project?.links?.demo,
      project?.links?.devpost,
    ]),
  ]
    .map((value) => norm(String(value || '')))
    .join(' | ');
}

function countTokenHits(blob: string, tokens: string[]): { count: number; evidence: string[] } {
  const evidence: string[] = [];
  let count = 0;
  for (const token of tokens) {
    const needle = norm(token);
    if (needle.length < 2) continue;
    const hit = needle.includes(' ')
      ? blob.includes(needle)
      : new RegExp(`(^|\\s|[|/,_-])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|[|/,_-]|$)`).test(blob);
    if (hit) {
      count += 1;
      if (evidence.length < 3) evidence.push(token);
    }
  }
  return { count, evidence };
}

function structuralBoost(
  id: EvidenceDimensionId,
  builder: any,
  projects: any[]
): { boost: number; evidence: string[] } {
  const links = builder?.links || {};
  const evidence: string[] = [];
  let boost = 0;

  if (id === 'ship_proof') {
    const liveDemos = (projects || []).filter((project: any) =>
      String(project?.links?.demo || '').startsWith('http')
    ).length;
    if (liveDemos) {
      boost += Math.min(0.35, liveDemos * 0.12);
      evidence.push(`${liveDemos} live demo${liveDemos === 1 ? '' : 's'}`);
    }
    if (links.portfolio || links.personalWebsite) {
      boost += 0.1;
      evidence.push('portfolio');
    }
  }

  if (id === 'oss_packages') {
    if (links.github) {
      boost += 0.2;
      evidence.push('GitHub linked');
    }
    const ghProjects = (projects || []).filter((project: any) =>
      String(project?.links?.github || '').startsWith('http')
    ).length;
    if (ghProjects) {
      boost += Math.min(0.25, ghProjects * 0.05);
      evidence.push(`${ghProjects} public repo${ghProjects === 1 ? '' : 's'}`);
    }
  }

  if (id === 'teaching' || id === 'community') {
    if (links.twitter) {
      boost += 0.12;
      evidence.push('Twitter/X linked');
    }
    if (links.devpost) {
      boost += 0.08;
      evidence.push('Devpost linked');
    }
  }

  if (id === 'design_craft') {
    if (links.portfolio || links.personalWebsite) {
      boost += 0.2;
      evidence.push('portfolio');
    }
  }

  return { boost, evidence };
}

/** Score a builder against the planned evidence dimensions. */
export function scoreRoleDimensions(params: {
  dimensions: PlannedEvidenceDimension[] | null | undefined;
  builder: any;
  projects: any[];
}): RoleDimensionScore | null {
  const dimensions = params.dimensions;
  if (!dimensions?.length) return null;

  const blob = buildEvidenceBlob(params.builder, params.projects);
  const hits: DimensionHit[] = [];

  for (const dimension of dimensions) {
    const { count, evidence } = countTokenHits(blob, dimension.matchAnyOf);
    const lexical = Math.min(1, count / Math.max(3, Math.min(8, dimension.matchAnyOf.length || 4)));
    const structural = structuralBoost(dimension.id, params.builder, params.projects);
    const score = Math.max(0, Math.min(1, lexical * 0.7 + structural.boost));
    hits.push({
      id: dimension.id,
      label: dimension.label,
      score,
      weight: dimension.weight,
      evidence: uniqueStrings([...evidence, ...structural.evidence], 4),
    });
  }

  const overall = hits.reduce((sum, hit) => sum + hit.score * hit.weight, 0);
  const winningHits = [...hits]
    .filter((hit) => hit.score >= 0.28)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3);

  return {
    overall: Math.max(0, Math.min(1, overall)),
    hits,
    winningHits: winningHits.length ? winningHits : [...hits].sort((a, b) => b.score - a.score).slice(0, 2),
  };
}

/** Founder-facing hire reason from winning role dimensions + builder-specific proof. */
export function buildReasonToHireFromDimensions(params: {
  dimensionScore: RoleDimensionScore | null | undefined;
  builder?: any;
  projects?: any[];
  roleTitle?: string | null;
}): string | null {
  const { dimensionScore, builder, projects, roleTitle } = params;
  if (!dimensionScore?.winningHits?.length) return null;

  const top = dimensionScore.winningHits[0];
  const second = dimensionScore.winningHits[1];
  const role = String(roleTitle || 'this role').trim() || 'this role';

  const experiences = Array.isArray(builder?.experiences) ? builder.experiences : [];
  const experience =
    experiences.find((item: any) => item?.isCurrent && item?.company) ||
    experiences.find(
      (item: any) =>
        item?.company &&
        !/^(full|part)[-\s]?time$/i.test(String(item.company)) &&
        String(item.company).trim().length > 1
    ) ||
    null;
  const experienceBit = experience
    ? [experience.title, experience.company].filter(Boolean).join(' at ').slice(0, 72)
    : null;

  const rankedProjects = [...(projects || [])]
    .filter((project: any) => project?.projectName)
    .sort((a: any, b: any) => {
      const score = (project: any) =>
        (project?.links?.demo ? 3 : 0) +
        (project?.links?.github ? 2 : 0) +
        (project?.builderContribution ? 1 : 0) +
        (Array.isArray(project?.techStack) ? Math.min(2, project.techStack.length / 3) : 0);
      return score(b) - score(a);
    });
  const project = rankedProjects[0] || null;
  const projectBit = project?.projectName ? String(project.projectName).slice(0, 48) : null;
  const stackBit = Array.isArray(project?.techStack)
    ? project.techStack
        .map(String)
        .filter(Boolean)
        .slice(0, 2)
        .join('/')
    : null;

  const skillPool = [
    ...(Array.isArray(builder?.skills) ? builder.skills : []),
    ...(Array.isArray(builder?.rolePreference) ? builder.rolePreference : []),
    ...(Array.isArray(project?.techStack) ? project.techStack : []),
  ]
    .map((skill: any) => String(skill || '').trim())
    .filter(Boolean);
  const uniqueSkills = [...new Set(skillPool.map((skill) => skill.toLowerCase()))]
    .slice(0, 3)
    .map((skill) => skillPool.find((item) => item.toLowerCase() === skill) || skill);

  const dimLabel = top.label.toLowerCase();
  const secondLabel = second?.label?.toLowerCase() || null;
  const concreteProof =
    projectBit ||
    experienceBit ||
    top.evidence.find((item) => !/^(typescript|react|node\.?js|frontend|backend|full-?stack)$/i.test(item)) ||
    top.evidence[0] ||
    uniqueSkills[0] ||
    null;

  // Prefer concrete builder anchors over shared dimension labels so two full-stack
  // matches don't collapse to the same "plus full-stack web implementation fit" line.
  const variants: string[] = [];
  if (experienceBit && projectBit) {
    variants.push(
      `${experienceBit} — shipped ${projectBit}${stackBit ? ` (${stackBit})` : ''}. Direct ${dimLabel} proof for ${role}.`
    );
  }
  if (projectBit && uniqueSkills.length) {
    variants.push(
      `Shipped ${projectBit} with ${uniqueSkills.slice(0, 2).join(' + ')}. That's the ${dimLabel} bar this ${role} needs.`
    );
  }
  if (experienceBit) {
    variants.push(
      `${experienceBit} brings real ${dimLabel}${secondLabel ? ` and ${secondLabel}` : ''}. Hire them to own that for ${role}.`
    );
  }
  if (concreteProof && !experienceBit) {
    variants.push(
      `${capitalize(String(concreteProof))} is the clearest ${dimLabel} signal here — strong hire for ${role}.`
    );
  }
  if (uniqueSkills.length >= 2) {
    variants.push(
      `${uniqueSkills.slice(0, 2).join(' + ')} already in production for them${projectBit ? ` via ${projectBit}` : ''}. Fits ${role} immediately.`
    );
  }

  // Stable per-builder pick so the same builder stays consistent, while different
  // builders with the same dimension hits still get different sentences.
  const seed = `${builder?._id || builder?.email || builder?.name || ''}|${projectBit || ''}|${experienceBit || ''}|${top.id}`;
  const pick = variants.length ? variants[hashString(seed) % variants.length] : null;
  if (!pick) {
    return `${capitalize(top.label)} proof${concreteProof ? ` via ${concreteProof}` : ''} for ${role}.`.slice(0, 220);
  }
  return pick.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function capitalize(value: string): string {
  const text = String(value || '').trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
