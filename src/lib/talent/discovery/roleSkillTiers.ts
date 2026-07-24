export type RoleDomain = 'mobile' | 'frontend' | 'backend' | 'fullstack' | 'ai' | 'design' | 'hardware' | 'general';

export type RoleSkillTiers = {
  domain: RoleDomain;
  primarySkills: string[];
  secondarySkills: string[];
  requiresPrimaryMatch: boolean;
};

const ROLE_DOMAIN_CLUSTERS: Record<Exclude<RoleDomain, 'general'>, string[]> = {
  mobile: [
    'kotlin', 'flutter', 'react native', 'swift', 'swiftui', 'dart', 'ios', 'android', 'expo',
    'jetpack compose', 'xcode', 'mobile', 'compose', 'android sdk', 'uikit',
  ],
  frontend: ['react', 'next.js', 'vue', 'svelte', 'typescript', 'javascript', 'tailwind', 'css', 'html', 'frontend'],
  backend: ['node.js', 'python', 'fastapi', 'django', 'express', 'postgres', 'mongodb', 'api', 'rest', 'backend'],
  fullstack: ['react', 'next.js', 'typescript', 'node.js', 'postgres', 'python', 'full-stack', 'fullstack'],
  ai: ['openai', 'llm', 'langchain', 'rag', 'pytorch', 'tensorflow', 'machine learning', 'embeddings'],
  design: ['figma', 'ui', 'ux', 'product design', 'design systems'],
  hardware: [
    'hardware', 'embedded', 'firmware', 'robotics', 'mechatronics', 'electronics', 'electrical',
    'circuit', 'pcb', 'fpga', 'asic', 'verilog', 'vhdl', 'microcontroller', 'sensor', 'actuator',
    'arduino', 'raspberry pi', 'solidworks', 'cad', 'rtl',
  ],
};

const DOMAIN_CONCEPT_KEYS: Record<RoleDomain, string[]> = {
  mobile: ['mobile', 'ios'],
  frontend: ['frontend', 'front-end', 'dashboard', 'saas'],
  backend: ['backend', 'back-end'],
  fullstack: ['fullstack', 'full-stack', 'saas'],
  ai: ['ai', 'ai agent', 'agents', 'llm', 'rag'],
  design: [],
  hardware: ['hardware', 'embedded', 'robotics', 'electronics', 'fpga', 'pcb'],
  general: [],
};

function norm(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function normalizeSkillTerm(input: string) {
  const lower = norm(input);
  if (lower === 'reactjs') return 'react';
  if (lower === 'react native') return 'react native';
  if (lower === 'nodejs' || lower === 'node') return 'node.js';
  if (lower === 'nextjs') return 'next.js';
  return lower;
}

function uniqueSkills(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const skill = normalizeSkillTerm(value);
    if (!skill || seen.has(skill)) continue;
    seen.add(skill);
    out.push(skill);
  }
  return out;
}

export function skillsMatch(builderSkill: string, requiredSkill: string) {
  const a = normalizeSkillTerm(builderSkill);
  const b = normalizeSkillTerm(requiredSkill);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = a.split(/[\s/+,_-]+/).filter((token) => token.length >= 3);
  const bTokens = b.split(/[\s/+,_-]+/).filter((token) => token.length >= 3);
  return aTokens.some((token) => bTokens.includes(token));
}

export function detectRoleDomain(roleTitle: string, skills: string[] = []): RoleDomain {
  const lower = `${roleTitle} ${skills.join(' ')}`.toLowerCase();
  if (/mobile|ios|android|flutter|react native|swift|expo|app developer/i.test(lower)) return 'mobile';
  if (/machine learning|ml engineer|ai engineer|llm|rag\b|openai/i.test(lower)) return 'ai';
  if (/full[\s-]?stack/i.test(lower)) return 'fullstack';
  if (/frontend|front[\s-]?end|ui engineer|react developer/i.test(lower)) return 'frontend';
  if (/backend|back[\s-]?end|api engineer|platform engineer/i.test(lower)) return 'backend';
  if (/designer|product design|ux|ui design/i.test(lower)) return 'design';
  if (/hardware|embedded|robotics|mechatronics|electrical|electronics|firmware|fpga|asic|pcb|verilog|vhdl/i.test(lower)) return 'hardware';
  return 'general';
}

export function buildRoleSkillTiers(opportunity: {
  roleTitle?: string | null;
  title?: string | null;
  originalSkillsNeeded?: string[] | null;
  skillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
}): RoleSkillTiers {
  const original = uniqueSkills(opportunity.originalSkillsNeeded || opportunity.skillsNeeded || []);
  const shaped = uniqueSkills(opportunity.skillsNeeded || []);
  const niceToHave = uniqueSkills(opportunity.niceToHaveSkills || []);
  const domain = detectRoleDomain(opportunity.roleTitle || opportunity.title || '', original);
  const cluster = domain === 'general' ? [] : ROLE_DOMAIN_CLUSTERS[domain];
  const genericLanguages = new Set(['c', 'c++', 'c#', 'java', 'python', 'javascript', 'typescript', 'go', 'rust']);
  // For a physical-systems role, C/C++ alone is supporting evidence—not proof
  // that the builder has hardware or robotics experience.
  const primarySkills = domain === 'hardware'
    ? uniqueSkills([...cluster, ...original.filter((skill) => !genericLanguages.has(skill))])
    : uniqueSkills([...original, ...cluster]);
  const primarySet = new Set(primarySkills);
  const secondarySkills = uniqueSkills([
    ...(domain === 'hardware' ? original.filter((skill) => genericLanguages.has(skill)) : []),
    ...shaped.filter((skill) => !primarySet.has(skill)),
    ...niceToHave,
  ]).filter((skill) => !primarySkills.some((primary) => skillsMatch(skill, primary)));

  return {
    domain,
    primarySkills,
    secondarySkills,
    requiresPrimaryMatch: domain !== 'general' && primarySkills.length > 0,
  };
}

import { collectBuilderSkillTokens } from '@/lib/talent/searchTokens';

export { collectBuilderSkillTokens };

export function matchedSkills(required: string[], tokens: Set<string>) {
  return required.filter((skill) => [...tokens].some((token) => skillsMatch(token, skill)));
}

export function builderHasPrimaryDomainMatch(tiers: RoleSkillTiers, builder: any, projects: any[]) {
  if (!tiers.requiresPrimaryMatch) return true;
  const tokens = collectBuilderSkillTokens(builder, projects);
  return matchedSkills(tiers.primarySkills, tokens).length > 0;
}

export function scoreRoleAwareSkillFit(
  tiers: RoleSkillTiers,
  builder: any,
  projects: any[],
  mustHaveSignals: string[] = []
) {
  const tokens = collectBuilderSkillTokens(builder, projects);
  const primaryMatched = matchedSkills(tiers.primarySkills, tokens);
  const secondaryMatched = matchedSkills(
    [...tiers.secondarySkills, ...mustHaveSignals.map(normalizeSkillTerm)],
    tokens
  );

  if (tiers.requiresPrimaryMatch && primaryMatched.length === 0) {
    return 0.04;
  }

  const primaryDenominator = Math.max(Math.min(tiers.primarySkills.length, 6), 1);
  const primaryRate = Math.min(1, primaryMatched.length / primaryDenominator);
  const primaryScore = primaryMatched.length > 0
    ? Math.min(1, 0.55 + primaryRate * 0.45)
    : 0.15;
  const secondaryRate = secondaryMatched.length
    ? Math.min(1, secondaryMatched.length / Math.max(tiers.secondarySkills.length, 1))
    : 0;
  return Math.min(1, primaryScore * 0.82 + secondaryRate * 0.18);
}

export function scoreDomainProofStrength(tiers: RoleSkillTiers, projects: any[]) {
  if (!projects.length) return 0;

  const VERIFIED = new Set(['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified']);
  const IMPORTED = new Set(['imported_unverified']);
  let best = 0;

  for (const project of projects) {
    const stack = [...(project.techStack || []), ...(project.contributionTags || [])].map((value) => normalizeSkillTerm(String(value)));
    const domainHits = tiers.primarySkills.filter((skill) => stack.some((token) => skillsMatch(token, skill)));
    let score = 0;
    if (domainHits.length) score += 0.35 + Math.min(0.25, domainHits.length * 0.08);
    if (VERIFIED.has(project.verificationStatus)) score += 0.15;
    else if (IMPORTED.has(project.verificationStatus)) score += 0.08;
    if (project.links?.github) score += 0.1;
    if (project.links?.demo) score += 0.1;
    if (project.links?.devpost) score += 0.2;
    if (project.builderContribution && String(project.builderContribution).length > 30) score += 0.1;
    best = Math.max(best, Math.min(1, score));
  }

  return best;
}

export function conceptAllowedForDomain(concept: string, domain: RoleDomain) {
  if (domain === 'general') return true;
  const allowed = DOMAIN_CONCEPT_KEYS[domain];
  return allowed.includes(concept);
}
