import {
  buildRoleSkillTiers,
  conceptAllowedForDomain,
  detectRoleDomain,
} from '@/lib/talent/discovery/roleSkillTiers';
import { getTalentPoolSkillIndex } from '@/lib/talent/talentPoolSkillIndex';

export type JobShapingInput = {
  title?: string | null;
  description?: string | null;
  builderWillDo?: string | null;
  skillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
  requirements?: string[] | null;
  responsibilities?: string[] | null;
  companyContext?: string | null;
};

export type JobShapingResult = {
  skillsNeeded: string[];
  niceToHaveSkills: string[];
  matchingSkills: string[];
  originalSkillsNeeded: string[];
  poolFitMetadata: {
    applied: boolean;
    confidence: 'low' | 'medium' | 'high';
    mappedSkills: Array<{ from: string; to: string[]; reason: string }>;
    addedSkills: string[];
    weakSkills: string[];
    topPoolSkills: string[];
  };
};

const SKILL_ALIASES: Record<string, string[]> = {
  ai: ['OpenAI', 'LLM', 'LangChain', 'RAG', 'Python', 'TypeScript'],
  'ai agent': ['OpenAI', 'LLM', 'LangChain', 'RAG', 'Python', 'TypeScript'],
  agents: ['OpenAI', 'LLM', 'LangChain', 'RAG', 'TypeScript'],
  llm: ['OpenAI', 'LangChain', 'RAG', 'Python', 'TypeScript'],
  rag: ['RAG', 'Vector Search', 'OpenAI', 'LangChain', 'Python'],
  automation: ['TypeScript', 'Node.js', 'Python', 'APIs'],
  workflow: ['TypeScript', 'Node.js', 'APIs', 'React'],
  frontend: ['React', 'Next.js', 'TypeScript', 'Tailwind'],
  'front-end': ['React', 'Next.js', 'TypeScript', 'Tailwind'],
  backend: ['Node.js', 'Python', 'Postgres', 'MongoDB', 'APIs'],
  'back-end': ['Node.js', 'Python', 'Postgres', 'MongoDB', 'APIs'],
  fullstack: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Postgres'],
  'full-stack': ['React', 'Next.js', 'TypeScript', 'Node.js', 'Postgres'],
  mobile: ['React Native', 'Expo', 'Swift', 'Flutter'],
  ios: ['Swift', 'React Native', 'Expo'],
  dashboard: ['React', 'Next.js', 'TypeScript', 'Tailwind', 'Postgres'],
  saas: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Postgres'],
  payments: ['Stripe', 'Node.js', 'TypeScript'],
  auth: ['Auth', 'OAuth', 'Next.js', 'Node.js'],
};

const STOPWORDS = new Set([
  'and',
  'or',
  'the',
  'with',
  'for',
  'developer',
  'engineer',
  'builder',
  'role',
  'hire',
]);

function normalizeSkill(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'node') return 'Node.js';
  if (lower === 'nodejs') return 'Node.js';
  if (lower === 'nextjs') return 'Next.js';
  if (lower === 'reactjs') return 'React';
  if (lower === 'postgresql') return 'Postgres';
  if (lower === 'mongodb') return 'MongoDB';
  if (lower === 'openai api') return 'OpenAI';
  if (lower === 'llms') return 'LLM';
  if (lower === 'apis') return 'APIs';
  if (lower === 'tailwindcss') return 'Tailwind';
  return trimmed
    .replace(/\s+/g, ' ')
    .replace(/^javascript$/i, 'JavaScript')
    .replace(/^typescript$/i, 'TypeScript')
    .replace(/^python$/i, 'Python')
    .replace(/^react$/i, 'React');
}

function uniqueList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const skill = normalizeSkill(value);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}

function inferConcepts(input: JobShapingInput, domain = detectRoleDomain(input.title || '', input.skillsNeeded || [])): string[] {
  const text = [
    input.title,
    input.description,
    input.builderWillDo,
    ...(input.requirements || []),
    ...(input.responsibilities || []),
    ...(input.skillsNeeded || []),
  ].filter(Boolean).join(' ').toLowerCase();

  const concepts = new Set<string>();
  for (const key of Object.keys(SKILL_ALIASES)) {
    if (!text.includes(key)) continue;
    if (!conceptAllowedForDomain(key, domain)) continue;
    concepts.add(key);
  }
  for (const token of text.split(/[^a-z0-9.+#-]+/i)) {
    if (token.length > 2 && !STOPWORDS.has(token) && SKILL_ALIASES[token] && conceptAllowedForDomain(token, domain)) {
      concepts.add(token);
    }
  }
  return Array.from(concepts);
}

export async function shapeJobForTalentPool(input: JobShapingInput): Promise<JobShapingResult> {
  const originalSkillsNeeded = uniqueList(input.skillsNeeded || []);
  const niceToHave = uniqueList(input.niceToHaveSkills || []);
  const domain = detectRoleDomain(input.title || '', originalSkillsNeeded);
  const roleTiers = buildRoleSkillTiers({
    roleTitle: input.title,
    originalSkillsNeeded,
    skillsNeeded: originalSkillsNeeded,
    niceToHaveSkills: niceToHave,
  });
  const concepts = inferConcepts(input, domain);

  const coreSkillsFromRole = uniqueList([
    ...originalSkillsNeeded,
    ...roleTiers.primarySkills.filter((skill) =>
      !originalSkillsNeeded.some((original) => original.toLowerCase() === skill.toLowerCase())
    ),
  ]).slice(0, 10);

  const needsPoolIndex = coreSkillsFromRole.length < 3;
  const index = needsPoolIndex ? await getTalentPoolSkillIndex() : null;

  const mappedSkills: JobShapingResult['poolFitMetadata']['mappedSkills'] = [];
  const supplementalSkills: string[] = [];

  if (index) {
    for (const concept of concepts) {
      const aliases = SKILL_ALIASES[concept] || [];
      const poolBacked = aliases.filter((skill) => index.skillMap.has(skill.toLowerCase()));
      if (!poolBacked.length) continue;
      mappedSkills.push({
        from: concept,
        to: poolBacked.slice(0, 5),
        reason: 'present in current talent pool proof/profile data',
      });
      supplementalSkills.push(...poolBacked);
    }
  }

  const weakSkills = index
    ? originalSkillsNeeded.filter((skill) => !index.skillMap.has(skill.toLowerCase()))
    : [];
  const topPoolFallbacks = index
    ? index.topSkills
      .filter((signal) => signal.projectCount > 0)
      .map((signal) => signal.skill)
      .filter((skill) => !weakSkills.some((weak) => weak.toLowerCase() === skill.toLowerCase()))
      .slice(0, 3)
    : [];

  const coreSkills = [...coreSkillsFromRole];
  if (coreSkills.length < 3) coreSkills.push(...topPoolFallbacks);

  const matchingSkills = coreSkills;
  const addedSkills = uniqueList([
    ...supplementalSkills,
    ...topPoolFallbacks,
  ]).filter(
    (skill) => !originalSkillsNeeded.some((original) => original.toLowerCase() === skill.toLowerCase())
  );
  const shapedNiceToHave = uniqueList([...niceToHave, ...addedSkills]).slice(0, 10);
  const poolBackedCount = index
    ? matchingSkills.filter((skill) => index.skillMap.has(skill.toLowerCase())).length
    : matchingSkills.length;

  return {
    originalSkillsNeeded,
    skillsNeeded: matchingSkills.length ? matchingSkills : originalSkillsNeeded,
    niceToHaveSkills: shapedNiceToHave,
    matchingSkills,
    poolFitMetadata: {
      applied: addedSkills.length > 0 || weakSkills.length > 0,
      confidence: poolBackedCount >= 4 ? 'high' : poolBackedCount >= 2 ? 'medium' : 'low',
      mappedSkills,
      addedSkills,
      weakSkills,
      topPoolSkills: index ? index.topSkills.slice(0, 10).map((signal) => signal.skill) : [],
    },
  };
}
