import {
  evaluateGithubActivityRequirement,
  isGithubActivityRequirement,
} from '@/lib/talent/githubActivity';
import { expandDomainProofTerms } from '@/lib/talent/roleEvidenceDossier';

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
    for (const token of tokenizeText(project?.description, 10)) tokens.add(token);
    for (const token of tokenizeText(project?.builderContribution, 8)) tokens.add(token);
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

function hasPhrase(text: string, phrase: string) {
  const needle = normalizeSearchTerm(phrase);
  if (!needle) return false;
  return new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i').test(text);
}

function matchesRoleConcept(text: string, concept: string) {
  if (hasPhrase(text, concept)) return true;
  const normalizedConcept = normalizeSearchTerm(concept);
  const meaningfulTerms = normalizedConcept
    .split(' ')
    .filter((term) => term.length >= 4 && !['engineer', 'systems', 'design', 'development'].includes(term));
  // A broad word from a compound concept is not role proof. For example,
  // "hardware engineer" must not match a web project that merely says
  // "hardware auto-detection." Only domain-specific atomic concepts can
  // fall back to a single-token match; multi-word role titles need their
  // full phrase or another explicit domain anchor.
  const safeAtomicConcepts = new Set([
    'robotics',
    'mechatronics',
    'embedded',
    'firmware',
    'verilog',
    'vhdl',
    'fpga',
    'asic',
    'pcb',
    'circuit',
    'circuits',
    'sensor',
    'sensors',
    'actuator',
    'microcontroller',
    'microprocessor',
    'schematic',
    'rtl',
  ]);
  if (meaningfulTerms.length !== 1 || !safeAtomicConcepts.has(meaningfulTerms[0])) return false;
  return hasPhrase(text, meaningfulTerms[0]);
}

function experienceEvidence(builder: any) {
  return (builder?.experiences || []).map((entry: any) => ({
    label: [entry?.title, entry?.company].filter(Boolean).join(' at '),
    text: normalizeSearchTerm([entry?.title, entry?.company, entry?.description, ...(entry?.skills || [])].join(' ')),
  }));
}

function projectEvidence(projects: any[]) {
  return projects.map((project) => ({
    label: String(project?.projectName || 'Project'),
    text: normalizeSearchTerm([
      project?.projectName,
      project?.description,
      project?.problemSolved,
      project?.builderContribution,
      ...(project?.techStack || []),
      ...(project?.contributionTags || []),
    ].join(' ')),
  }));
}

function evaluateSchoolEnrollment(
  requirementText: string,
  builder: any,
  matchAnyOf?: string[]
): { met: 'yes' | 'partial' | 'no'; evidence: string } {
  const schools = [
    builder?.universityOrCompany,
    ...(builder?.education || []).map((entry: any) => entry?.school),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const blob = normalizeSearchTerm(
    [builder?.headline, builder?.bio, builder?.currentStatus, ...schools].filter(Boolean).join(' ')
  );
  const aliases = requirementAliases(requirementText, matchAnyOf);

  for (const school of schools) {
    const normalizedSchool = normalizeSearchTerm(school);
    if (!normalizedSchool) continue;
    for (const alias of aliases) {
      if (alias.length >= 4 && (normalizedSchool.includes(alias) || alias.includes(normalizedSchool))) {
        return { met: 'yes', evidence: school.slice(0, 180) };
      }
    }
    if (/\b(university|college|institute|polytechnic|school)\b/i.test(school)) {
      return { met: 'yes', evidence: school.slice(0, 180) };
    }
  }

  if (
    (builder?.currentStatus === 'student' || /\bstudent\b/i.test(blob)) &&
    /\b(university|college|asu|stanford|mit|berkeley|enrolled)\b/i.test(blob)
  ) {
    return {
      met: 'yes',
      evidence: String(builder?.universityOrCompany || builder?.headline || 'Current student').slice(0, 180),
    };
  }

  return { met: 'no', evidence: 'No current US college/university enrollment evidence found.' };
}

function lineHasDomainProof(line: string, proofTerms: string[]) {
  const normalized = normalizeSearchTerm(line);
  if (!normalized || !proofTerms.length) return false;
  return proofTerms.some((term) => {
    const needle = normalizeSearchTerm(term);
    if (!needle) return false;
    if (needle.length <= 3) {
      return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized);
    }
    return normalized.includes(needle);
  });
}

function evaluateInternshipExperience(builder: any) {
  const match = experienceEvidence(builder).find((entry: { label: string; text: string }) =>
    /\b(?:intern(?:ship)?|co[-\s]?op|apprentice|fellow)\b/i.test(entry.text)
  );
  return match
    ? { met: 'yes' as const, evidence: match.label.slice(0, 180) }
    : { met: 'no' as const, evidence: 'No internship, co-op, apprenticeship, or fellowship is listed in experience.' };
}

function evaluateWorkExperience(builder: any) {
  const match = experienceEvidence(builder).find((entry: { label: string; text: string }) => entry.label.trim().length > 0);
  return match
    ? { met: 'yes' as const, evidence: match.label.slice(0, 180) }
    : { met: 'no' as const, evidence: 'No prior work experience is listed.' };
}

function evaluateProjectExperience(projects: any[]) {
  const match = projectEvidence(projects).find((entry: { label: string; text: string }) => entry.label.trim().length > 0);
  return match
    ? { met: 'yes' as const, evidence: match.label.slice(0, 180) }
    : { met: 'no' as const, evidence: 'No prior project evidence is listed.' };
}

function evaluateRoleRelevance(builder: any, projects: any[], compiled: any) {
  const plan = compiled?.roleEvidence || compiled;
  const anchors: string[] = Array.isArray(plan?.anchorConcepts) ? plan.anchorConcepts.map(String) : [];
  const supporting: string[] = Array.isArray(plan?.supportingConcepts) ? plan.supportingConcepts.map(String) : [];
  const workEvidence = [...experienceEvidence(builder), ...projectEvidence(projects)];
  const anchorHits = anchors.flatMap((term) =>
    workEvidence.filter((entry) => matchesRoleConcept(entry.text, term)).map((entry) => `${entry.label}: ${term}`)
  );
  const allEvidence = [...workEvidence, { label: 'Skills', text: normalizeSearchTerm([...(builder?.skills || []), ...(builder?.rolePreference || [])].join(' ')) }];
  const totalTerms = new Set(
    [...anchors, ...supporting].filter((term) => allEvidence.some((entry) => matchesRoleConcept(entry.text, term)))
  );
  const minAnchors = Math.max(1, Number(plan?.minimumAnchorMatches) || 1);
  const minTotal = Math.max(1, Number(plan?.minimumTotalMatches) || 2);
  if (anchorHits.length >= minAnchors && totalTerms.size >= minTotal) {
    return { met: 'yes' as const, evidence: anchorHits.slice(0, 2).join('; ').slice(0, 180) };
  }
  if (anchorHits.length) {
    return { met: 'partial' as const, evidence: anchorHits.slice(0, 2).join('; ').slice(0, 180) };
  }
  return { met: 'no' as const, evidence: 'No role-relevant experience or project evidence found.' };
}

export function evaluateRoleEvidence(builder: any, projects: any[], roleEvidence: any) {
  return evaluateRoleRelevance(builder, projects, roleEvidence);
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
  compiled?: {
    matchAnyOf?: string[];
    matchHints?: string[];
    predicate?: string | null;
    roleEvidence?: any;
    mode?: string | null;
  } | null,
  options?: { githubActivityScore?: number | null }
): { met: 'yes' | 'partial' | 'no'; evidence: string } {
  if (isGithubActivityRequirement(requirementText)) {
    return evaluateGithubActivityRequirement(options?.githubActivityScore);
  }
  if (compiled?.predicate === 'internship_experience') {
    return evaluateInternshipExperience(builder);
  }
  if (compiled?.predicate === 'work_experience') {
    return evaluateWorkExperience(builder);
  }
  if (compiled?.predicate === 'project_experience') {
    return evaluateProjectExperience(projects);
  }
  if (compiled?.predicate === 'role_relevance') {
    return evaluateRoleRelevance(builder, projects, compiled?.roleEvidence || compiled);
  }

  const mode = String(compiled?.mode || '');
  const schoolLike =
    mode === 'school' || /\b(school|university|college|enrolled|student at)\b/i.test(requirementText);
  if (schoolLike) {
    return evaluateSchoolEnrollment(requirementText, builder, compiled?.matchAnyOf);
  }

  const experienceLike =
    mode === 'category' ||
    mode === 'project_evidence' ||
    /\b(experience|background|worked|internship|intern|previous|prior)\b/i.test(requirementText);

  const aliases = requirementAliases(requirementText, compiled?.matchAnyOf).filter((alias) => {
    if (!alias) return false;
    // Reject ultra-short / generic atoms that caused false cyber must yes marks.
    if (alias.length < 4) return false;
    if (
      [
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
        'experience',
        'previous',
        'background',
        'security', // alone is too weak; prefer "cybersecurity" / multi-word phrases
      ].includes(alias)
    ) {
      return false;
    }
    return true;
  });

  // Always keep the original requirement text as an alias after filtering.
  const normalizedRequirement = normalizeSearchTerm(requirementText);
  if (normalizedRequirement && !aliases.includes(normalizedRequirement)) {
    aliases.unshift(normalizedRequirement);
  }

  const experienceLines = experienceEvidence(builder).map((entry) => entry.text);
  const projectLines = projectEvidence(projects).map((entry) => entry.text);
  const educationLines = (builder?.education || []).map((entry: any) =>
    normalizeSearchTerm([entry?.school, entry?.degree, entry?.field].filter(Boolean).join(' '))
  );
  const proofLines = experienceLike
    ? [...experienceLines, ...projectLines]
    : [...experienceLines, ...projectLines, ...educationLines];
  const skillLines = [
    ...(builder?.skills || []).map((skill: string) => normalizeSearchTerm(String(skill))),
    ...(builder?.rolePreference || []).map((skill: string) => normalizeSearchTerm(String(skill))),
  ];
  const softLines = [
    normalizeSearchTerm(builder?.headline || ''),
    normalizeSearchTerm(builder?.bio || ''),
    normalizeSearchTerm(builder?.universityOrCompany || ''),
    ...educationLines,
    ...skillLines,
  ].filter(Boolean);

  // Expand match aliases via domain vocab packs seeded by this requirement's
  // own plan tokens — not role-level anchors (those belong to role_relevance).
  const domainProofTerms = expandDomainProofTerms([
    ...aliases,
    requirementText,
    ...(Array.isArray(compiled?.matchAnyOf) ? compiled.matchAnyOf : []),
  ]);
  for (const term of domainProofTerms) {
    if (term && !aliases.includes(term)) aliases.push(term);
  }

  const REQUIREMENT_STOPWORDS = new Set([
    'experience',
    'experiences',
    'previous',
    'prior',
    'background',
    'years',
    'year',
    'completed',
    'currently',
    'enrolled',
    'working',
    'worked',
    'using',
    'with',
    'from',
    'that',
    'this',
    'have',
    'been',
    'selling', // alone; keep in bigrams like "selling sdks"
    'sales',
  ]);

  const isMeaningfulAlias = (alias: string) => {
    if (alias.includes(' ')) return true;
    if (REQUIREMENT_STOPWORDS.has(alias)) return false;
    if (alias.length >= 6) return true;
    return domainProofTerms.includes(alias) && alias.length >= 4;
  };

  let bestPartial = '';
  let bestPartialScore = 0;

  // Auto-yes on expanded domain proof only when THIS requirement's text/plan
  // phrases seed a domain pack (e.g. "cybersecurity" → SOC). Do not use
  // roleEvidence anchors here — they describe the whole role and would make
  // every experience must pass on unrelated title skills (e.g. Sales on GTM).
  const requirementSeededDomain = expandDomainProofTerms([
    requirementText,
    ...(Array.isArray(compiled?.matchAnyOf) ? compiled.matchAnyOf : []),
  ]).filter((term) => term.includes(' ') || (term.length >= 5 && !REQUIREMENT_STOPWORDS.has(term)));

  if (experienceLike && requirementSeededDomain.length > 0) {
    const domainProof = [...experienceLines, ...projectLines].find((line) =>
      lineHasDomainProof(line, requirementSeededDomain)
    );
    if (domainProof) {
      // Require that at least one matched term is distinctive (not just "sales").
      const distinctive = requirementSeededDomain.filter(
        (term) => term.includes(' ') || term.length >= 8 || !['marketing', 'python', 'java'].includes(term)
      );
      if (distinctive.length && lineHasDomainProof(domainProof, distinctive)) {
        return { met: 'yes', evidence: domainProof.slice(0, 180) };
      }
    }
  }

  for (const alias of aliases) {
    if (!alias || !isMeaningfulAlias(alias)) continue;

    const proofHit = proofLines.find((line) => line.includes(alias));
    if (proofHit) {
      return { met: 'yes', evidence: proofHit.slice(0, 180) };
    }

    // Multi-token phrase: require most *content* tokens in one proof line.
    const aliasParts = alias
      .split(' ')
      .filter((part) => part.length >= 4 && !REQUIREMENT_STOPWORDS.has(part));
    if (aliasParts.length >= 2) {
      const needed = Math.min(aliasParts.length, Math.max(2, Math.ceil(aliasParts.length * 0.7)));
      const multiHit = proofLines.find(
        (line) => aliasParts.filter((part) => line.includes(part)).length >= needed
      );
      if (multiHit) {
        return { met: 'yes', evidence: multiHit.slice(0, 180) };
      }
    }

    const softHit = softLines.find((line) => line.includes(alias));
    if (softHit) {
      // Skills / headline alone cannot fully satisfy experience-like musts.
      if (experienceLike) {
        bestPartialScore = Math.max(bestPartialScore, 0.7);
        bestPartial = softHit;
        continue;
      }
      return { met: 'yes', evidence: softHit.slice(0, 180) };
    }

    if (!experienceLike) {
      const tokens = collectBuilderSkillTokens(builder, projects);
      const tokenHit = [...tokens].some((token) => skillsMatch(token, alias) || token.includes(alias) || alias.includes(token));
      if (tokenHit) {
        return { met: 'yes', evidence: alias.slice(0, 180) };
      }
    } else {
      const skillOnly = skillLines.some((line) => line.includes(alias) || skillsMatch(line, alias));
      if (skillOnly) {
        bestPartialScore = Math.max(bestPartialScore, 0.65);
        bestPartial = alias;
      }
    }
  }

  if (compiled?.matchHints?.length) {
    const hints = compiled.matchHints
      .map((hint) => normalizeSearchTerm(hint))
      .filter((needle) => needle && needle.length >= 4 && !REQUIREMENT_STOPWORDS.has(needle));

    // For compound experience musts, a single generic hint (e.g. "sales") is not enough —
    // require two distinct hints to co-occur, or one multi-word hint.
    const strongHints = hints.filter((hint) => hint.includes(' ') || hint.length >= 6);
    for (const needle of strongHints) {
      const line = proofLines.find((entry) => entry.includes(needle));
      if (line) return { met: experienceLike ? 'partial' : 'yes', evidence: line.slice(0, 180) };
    }

    if (experienceLike && hints.length >= 2) {
      const coHit = proofLines.find(
        (line) => hints.filter((hint) => line.includes(hint)).length >= 2
      );
      if (coHit) return { met: 'partial', evidence: coHit.slice(0, 180) };
    } else if (!experienceLike) {
      for (const needle of hints) {
        const line = proofLines.find((entry) => entry.includes(needle));
        if (line) return { met: 'yes', evidence: line.slice(0, 180) };
      }
    }

    for (const needle of strongHints) {
      if (softLines.some((entry) => entry.includes(needle))) {
        bestPartialScore = Math.max(bestPartialScore, 0.55);
        bestPartial = needle;
      }
    }
  }

  if (bestPartialScore >= 0.5) return { met: 'partial', evidence: bestPartial.slice(0, 180) };
  return { met: 'no', evidence: '' };
}

export function buildRequirementFindings(
  opportunity: any,
  builder: any,
  projects: any[] = [],
  options?: { githubActivityScore?: number | null }
) {
  const requirements = normalizeRequirements(opportunity);
  const planRequirements = Array.isArray(opportunity?.searchPlan?.requirements)
    ? opportunity.searchPlan.requirements
    : [];
  const planByText = new Map(
    planRequirements.map((item: any) => [normalizeSearchTerm(item?.text), item])
  );

  return requirements.map((requirement) => {
    const baseCompiled = planByText.get(normalizeSearchTerm(requirement.text)) || null;
    const compiled = baseCompiled
      ? { ...baseCompiled, roleEvidence: opportunity?.searchPlan?.roleEvidence || null }
      : null;
    return {
      text: requirement.text,
      importance: requirement.importance,
      ...evaluateFounderRequirement(requirement.text, builder, projects, compiled, options),
    };
  });
}

export function scoreFounderPreferenceFit(
  opportunity: any,
  builder: any,
  projects: any[] = [],
  options?: { githubActivityScore?: number | null }
) {
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
    const result = evaluateFounderRequirement(requirement.text, builder, projects, compiled, options);
    const score = result.met === 'yes' ? 1 : result.met === 'partial' ? 0.55 : 0;
    weighted += score * weight;
    totalWeight += weight;
  }
  return totalWeight ? weighted / totalWeight : 0;
}
