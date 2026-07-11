const INDEX_STOP_TERMS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'ai',
  'app',
  'build',
  'builder',
  'building',
  'development',
  'developer',
  'engineer',
  'engineering',
  'experience',
  'intern',
  'internship',
  'platform',
  'product',
  'project',
  'proof',
  'role',
  'saas',
  'ship',
  'shipped',
  'software',
  'startup',
  'tool',
  'web',
  'work',
  'worked',
]);

function norm(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeSkillTerm(input: string) {
  const lower = norm(input);
  if (lower === 'reactjs') return 'react';
  if (lower === 'react native') return 'react native';
  if (lower === 'nodejs' || lower === 'node') return 'node.js';
  if (lower === 'nextjs') return 'next.js';
  return lower;
}

function skillsMatch(builderSkill: string, requiredSkill: string) {
  const a = normalizeSkillTerm(builderSkill);
  const b = normalizeSkillTerm(requiredSkill);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = a.split(/[\s/+,_-]+/).filter((token) => token.length >= 3);
  const bTokens = b.split(/[\s/+,_-]+/).filter((token) => token.length >= 3);
  return aTokens.some((token) => bTokens.includes(token));
}

function detectRoleDomainForSearch(roleTitle: string, skills: string[] = []) {
  const lower = `${roleTitle} ${skills.join(' ')}`.toLowerCase();
  if (/mobile|ios|android|flutter|react native|swift|expo|app developer/i.test(lower)) return 'mobile';
  if (/machine learning|ml engineer|ai engineer|llm|rag\b|openai/i.test(lower)) return 'ai';
  if (/full[\s-]?stack/i.test(lower)) return 'fullstack';
  if (/frontend|front[\s-]?end|ui engineer|react developer/i.test(lower)) return 'frontend';
  if (/backend|back[\s-]?end|api engineer|platform engineer/i.test(lower)) return 'backend';
  if (/designer|product design|ux|ui design/i.test(lower)) return 'design';
  return 'general';
}

const BIG_TECH_ALIASES: Record<string, string[]> = {
  // Kept only as a last-resort lexical hint when SearchPlan is missing.
  // Prefer compileSearchPlan() expansions for category requirements.
  'big tech': ['google', 'meta', 'facebook', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'openai', 'anthropic'],
  faang: ['facebook', 'meta', 'apple', 'amazon', 'netflix', 'google'],
};

export function normalizeSearchTerm(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uniqueSearchTerms(values: unknown[], max = 80) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const term = normalizeSearchTerm(value);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return out.slice(0, max);
}

export function expandSearchTerms(values: unknown[], max = 120) {
  const terms = new Set<string>();
  for (const value of values) {
    const normalized = normalizeSearchTerm(value);
    if (!normalized) continue;
    terms.add(normalized);
    for (const part of normalized.split(' ')) {
      if (part.length >= 2) terms.add(part);
    }
  }
  return [...terms].slice(0, max);
}

function isUsefulToken(term: string) {
  return term.length >= 2 && term.length <= 48 && !INDEX_STOP_TERMS.has(term);
}

export function tokenizeText(text: string | null | undefined, max = 20) {
  const normalized = normalizeSearchTerm(text);
  if (!normalized) return [];
  const tokens = new Set<string>();
  for (const part of normalized.split(' ')) {
    if (isUsefulToken(part)) tokens.add(part);
  }
  const words = normalized.split(' ').filter(isUsefulToken);
  for (let i = 0; i < words.length - 1; i += 1) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (bigram.length <= 48) tokens.add(bigram);
  }
  return [...tokens].slice(0, max);
}

export function extractBioKeywords(bio: string | null | undefined, max = 14) {
  if (!bio?.trim()) return [];
  const sentences = bio
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
  const terms = new Set<string>();
  for (const sentence of sentences.slice(0, 4)) {
    for (const token of tokenizeText(sentence, 10)) terms.add(token);
  }
  return [...terms].slice(0, max);
}

export type BuilderSearchProfile = {
  skills: string[];
  experienceCompanies: string[];
  experienceTitles: string[];
  experiencePhrases: string[];
  educationSchools: string[];
  enrichmentTitles: string[];
  highlightTerms: string[];
  bioKeywords: string[];
  roleDomains: string[];
};

export function collectBuilderSearchProfile(builder: any, projects: any[] = []): BuilderSearchProfile {
  const skills = uniqueSearchTerms(
    [...(builder?.rolePreference || []), ...(builder?.skills || []), ...(builder?.preferredWorkType || [])].map(
      (skill) => normalizeSkillTerm(String(skill))
    ),
    48
  );

  const experiences = builder?.experiences || [];
  const experienceCompanies = uniqueSearchTerms(
    experiences.map((entry: any) => entry?.company).filter(Boolean),
    20
  );
  const experienceTitles = uniqueSearchTerms(
    experiences.flatMap((entry: any) => [entry?.title, [entry?.title, entry?.company].filter(Boolean).join(' at ')]),
    24
  );
  const experiencePhrases = uniqueSearchTerms(
    experiences.flatMap((entry: any) => tokenizeText(entry?.description, 8)),
    30
  );

  const educationSchools = uniqueSearchTerms(
    [
      builder?.universityOrCompany,
      ...(builder?.education || []).flatMap((entry: any) => [entry?.school, entry?.degree, entry?.field]),
    ].filter(Boolean),
    16
  );

  const enrichmentTitles = uniqueSearchTerms(
    (builder?.enrichmentInsights?.founderHighlights || []).flatMap((item: any) => [item?.title, item?.detail]),
    16
  );

  const highlightTerms = uniqueSearchTerms(
    [
      ...(builder?.enrichmentInsights?.founderHighlights || []),
      ...(builder?.profileQuality?.strengths || []),
    ].flatMap((item: any) => [
      item?.title,
      item?.detail,
      ...tokenizeText(item?.title, 6),
      ...tokenizeText(item?.detail, 12),
    ]),
    28
  );

  const bioKeywords = extractBioKeywords(builder?.bio, 14);
  const domain = detectRoleDomainForSearch(builder?.headline || '', skills);
  const roleDomains = domain === 'general' ? [] : [domain];

  void projects;

  return {
    skills,
    experienceCompanies,
    experienceTitles,
    experiencePhrases,
    educationSchools,
    enrichmentTitles,
    highlightTerms,
    bioKeywords,
    roleDomains,
  };
}

export function collectBuilderSkillTokens(builder: any, projects: any[] = []) {
  const tokens = new Set<string>();
  const profile = collectBuilderSearchProfile(builder, projects);

  for (const skill of profile.skills) tokens.add(skill);
  for (const company of profile.experienceCompanies) tokens.add(company);
  for (const title of profile.experienceTitles) tokens.add(title);
  for (const school of profile.educationSchools) tokens.add(school);
  for (const phrase of profile.experiencePhrases) tokens.add(phrase);
  for (const keyword of profile.bioKeywords) tokens.add(keyword);
  for (const highlight of profile.enrichmentTitles) tokens.add(highlight);
  for (const highlight of profile.highlightTerms) tokens.add(highlight);
  for (const domain of profile.roleDomains) tokens.add(domain);

  for (const project of projects) {
    for (const skill of project?.techStack || []) tokens.add(normalizeSkillTerm(String(skill)));
    for (const tag of project?.contributionTags || []) tokens.add(normalizeSkillTerm(String(tag)));
    for (const token of tokenizeText(project?.projectName, 4)) tokens.add(token);
  }

  if (builder?.headline) tokens.add(normalizeSearchTerm(String(builder.headline)));
  if (builder?.profileQuality?.oneLineSummary) {
    for (const token of tokenizeText(builder.profileQuality.oneLineSummary, 6)) tokens.add(token);
  }

  return tokens;
}

export type SearchRequirement = { text: string; importance: 'must' | 'nice' };

export function getSearchRequirements(opportunity: any): SearchRequirement[] {
  return normalizeRequirements(opportunity);
}

export function countMustSearchRequirements(opportunity: any): number {
  return getSearchRequirements(opportunity).filter((requirement) => requirement.importance === 'must').length;
}

export function normalizeRequirements(opportunity: any): SearchRequirement[] {
  const structured = Array.isArray(opportunity?.searchRequirements)
    ? opportunity.searchRequirements
        .map((requirement: any) => ({
          text: String(requirement?.text || '').trim(),
          importance: requirement?.importance === 'nice' ? ('nice' as const) : ('must' as const),
        }))
        .filter((requirement: { text: string }) => requirement.text)
    : [];
  const legacy = Array.isArray(opportunity?.requirements)
    ? opportunity.requirements
        .map((text: unknown) => ({ text: String(text || '').trim(), importance: 'must' as const }))
        .filter((requirement: { text: string }) => requirement.text)
    : [];

  const seen = new Set<string>();
  return [...structured, ...legacy].filter((requirement) => {
    const key = requirement.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceLines(builder: any, projects: any[] = []) {
  const profile = collectBuilderSearchProfile(builder, projects);
  const lines: string[] = [];

  for (const entry of builder?.experiences || []) {
    lines.push(
      [
        [entry?.title, entry?.company].filter(Boolean).join(' at '),
        entry?.description || '',
        ...(entry?.skills || []),
      ].join(' ')
    );
  }
  for (const entry of builder?.education || []) {
    lines.push([entry?.school, entry?.degree, entry?.field].filter(Boolean).join(' '));
  }
  lines.push(builder?.headline || '', builder?.bio || '', builder?.profileQuality?.oneLineSummary || '');
  lines.push(...profile.skills, ...profile.enrichmentTitles, ...profile.highlightTerms);
  for (const project of projects.slice(0, 6)) {
    lines.push(
      [project?.projectName, project?.description, project?.problemSolved, project?.builderContribution]
        .filter(Boolean)
        .join(' ')
    );
    lines.push(...(project?.techStack || []), ...(project?.contributionTags || []));
  }
  return lines.map((line) => normalizeSearchTerm(line)).filter(Boolean);
}

function requirementAliases(requirementText: string, matchAnyOf?: string[]) {
  const normalized = normalizeSearchTerm(requirementText);
  const aliases = new Set<string>([normalized]);

  // Prefer compiled SearchPlan tokens when available (general: Ivy, Big Tech, blogs, etc.)
  if (matchAnyOf?.length) {
    for (const token of matchAnyOf) {
      const cleaned = normalizeSearchTerm(token);
      if (cleaned) aliases.add(cleaned);
    }
    for (const token of tokenizeText(normalized, 8)) aliases.add(token);
    return [...aliases].filter(Boolean);
  }

  // Fallback only when no plan is cached yet
  for (const [label, companies] of Object.entries(BIG_TECH_ALIASES)) {
    if (normalized.includes(label)) companies.forEach((company) => aliases.add(company));
  }
  const workedAt = normalized.match(/(?:worked|intern(?:ed)?|experience)\s+(?:at|@)\s+([a-z0-9.+ ]{2,40})/);
  if (workedAt?.[1]) aliases.add(normalizeSearchTerm(workedAt[1]));
  const atCompany = normalized.match(/\bat\s+([a-z0-9.+ ]{2,40})/);
  if (atCompany?.[1]) aliases.add(normalizeSearchTerm(atCompany[1]));
  for (const token of tokenizeText(normalized, 8)) aliases.add(token);
  return [...aliases].filter(Boolean);
}

export function evaluateFounderRequirement(
  requirementText: string,
  builder: any,
  projects: any[] = [],
  compiled?: { matchAnyOf?: string[]; matchHints?: string[] } | null
): { met: 'yes' | 'partial' | 'no'; evidence: string } {
  const aliases = requirementAliases(requirementText, compiled?.matchAnyOf);
  const evidence = evidenceLines(builder, projects);
  const tokens = collectBuilderSkillTokens(builder, projects);
  const profile = collectBuilderSearchProfile(builder, projects);

  let bestEvidence = '';
  let bestScore = 0;

  for (const alias of aliases) {
    if (!alias) continue;
    const fullHit = evidence.some((line) => line.includes(alias));
    if (fullHit) {
      const line = evidence.find((entry) => entry.includes(alias)) || alias;
      return { met: 'yes', evidence: line.slice(0, 180) };
    }

    const tokenHit = [...tokens].some((token) => skillsMatch(token, alias) || token.includes(alias) || alias.includes(token));
    if (tokenHit) {
      const matched =
        profile.experienceCompanies.find((company) => skillsMatch(company, alias) || company.includes(alias)) ||
        profile.educationSchools.find((school) => school.includes(alias)) ||
        profile.skills.find((skill) => skillsMatch(skill, alias)) ||
        alias;
      return { met: 'yes', evidence: String(matched).slice(0, 180) };
    }

    const partial = [...tokens].some((token) => {
      const aliasTokens = alias.split(' ').filter((part) => part.length >= 3);
      return aliasTokens.some((part) => token.includes(part) || part.includes(token));
    });
    if (partial) {
      bestScore = Math.max(bestScore, 0.6);
      bestEvidence = alias;
    }
  }

  if (compiled?.matchHints?.length) {
    for (const hint of compiled.matchHints) {
      const needle = normalizeSearchTerm(hint);
      if (!needle) continue;
      const line = evidence.find((entry) => entry.includes(needle));
      if (line) return { met: 'partial', evidence: line.slice(0, 180) };
    }
  }

  if (bestScore >= 0.5) return { met: 'partial', evidence: bestEvidence.slice(0, 180) };
  return { met: 'no', evidence: '' };
}

export function buildRequirementFindings(
  opportunity: any,
  builder: any,
  projects: any[] = []
) {
  const requirements = normalizeRequirements(opportunity);
  const planRequirements = Array.isArray(opportunity?.searchPlan?.requirements)
    ? opportunity.searchPlan.requirements
    : [];
  const planByText = new Map(
    planRequirements.map((item: any) => [normalizeSearchTerm(item?.text), item])
  );

  return requirements.map((requirement) => {
    const compiled = planByText.get(normalizeSearchTerm(requirement.text)) || null;
    return {
      text: requirement.text,
      importance: requirement.importance,
      ...evaluateFounderRequirement(requirement.text, builder, projects, compiled),
    };
  });
}

export function scoreFounderPreferenceFit(opportunity: any, builder: any, projects: any[] = []) {
  const requirements = normalizeRequirements(opportunity);
  if (!requirements.length) return 0;
  const planRequirements = Array.isArray(opportunity?.searchPlan?.requirements)
    ? opportunity.searchPlan.requirements
    : [];
  const planByText = new Map(
    planRequirements.map((item: any) => [normalizeSearchTerm(item?.text), item])
  );

  let weighted = 0;
  let totalWeight = 0;
  for (const requirement of requirements) {
    const weight = requirement.importance === 'must' ? 2 : 1;
    const compiled = planByText.get(normalizeSearchTerm(requirement.text)) || null;
    const result = evaluateFounderRequirement(requirement.text, builder, projects, compiled);
    const score = result.met === 'yes' ? 1 : result.met === 'partial' ? 0.55 : 0;
    weighted += score * weight;
    totalWeight += weight;
  }
  return totalWeight ? weighted / totalWeight : 0;
}
