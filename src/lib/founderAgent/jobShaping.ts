import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';

type TalentSkillSignal = {
  skill: string;
  score: number;
  builderCount: number;
  projectCount: number;
  proofCount: number;
};

type TalentPoolIndex = {
  generatedAt: Date;
  topSkills: TalentSkillSignal[];
  skillMap: Map<string, TalentSkillSignal>;
};

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

let cachedIndex: { expiresAt: number; value: TalentPoolIndex } | null = null;

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

function addSignal(
  signals: Map<string, TalentSkillSignal>,
  rawSkill: unknown,
  source: 'builder' | 'project' | 'proof'
) {
  const skill = normalizeSkill(rawSkill);
  if (!skill) return;
  const key = skill.toLowerCase();
  const existing = signals.get(key) || { skill, score: 0, builderCount: 0, projectCount: 0, proofCount: 0 };
  if (source === 'builder') {
    existing.builderCount += 1;
    existing.score += 1.5;
  } else if (source === 'project') {
    existing.projectCount += 1;
    existing.score += 2;
  } else {
    existing.proofCount += 1;
    existing.score += 1;
  }
  signals.set(key, existing);
}

function inferConcepts(input: JobShapingInput): string[] {
  const text = [
    input.title,
    input.description,
    input.builderWillDo,
    input.companyContext,
    ...(input.requirements || []),
    ...(input.responsibilities || []),
    ...(input.skillsNeeded || []),
  ].filter(Boolean).join(' ').toLowerCase();

  const concepts = new Set<string>();
  for (const key of Object.keys(SKILL_ALIASES)) {
    if (text.includes(key)) concepts.add(key);
  }
  for (const token of text.split(/[^a-z0-9.+#-]+/i)) {
    if (token.length > 2 && !STOPWORDS.has(token) && SKILL_ALIASES[token]) concepts.add(token);
  }
  return Array.from(concepts);
}

export async function getTalentPoolSkillIndex(ttlMs = 10 * 60 * 1000): Promise<TalentPoolIndex> {
  if (cachedIndex && cachedIndex.expiresAt > Date.now()) return cachedIndex.value;

  const [builders, projects] = await Promise.all([
    BuilderProfile.find({
      verificationStatus: { $ne: 'rejected' },
      visibilityStatus: { $ne: 'hidden' },
    })
      .select('rolePreference preferredWorkType headline bio experiences.skills')
      .limit(2000)
      .lean(),
    ProjectRecord.find({ verificationStatus: { $ne: 'rejected' } })
      .select('techStack contributionTags verificationStatus confidence')
      .limit(5000)
      .lean(),
  ]);

  const signals = new Map<string, TalentSkillSignal>();

  for (const builder of builders as any[]) {
    for (const skill of builder.rolePreference || []) addSignal(signals, skill, 'builder');
    for (const workType of builder.preferredWorkType || []) addSignal(signals, workType, 'builder');
    for (const exp of builder.experiences || []) {
      for (const skill of exp.skills || []) addSignal(signals, skill, 'builder');
    }
  }

  for (const project of projects as any[]) {
    for (const skill of project.techStack || []) addSignal(signals, skill, 'project');
    for (const tag of project.contributionTags || []) addSignal(signals, tag, 'proof');
    if (project.verificationStatus === 'builder_confirmed' || project.verificationStatus === 'admin_verified') {
      for (const skill of project.techStack || []) addSignal(signals, skill, 'proof');
    }
  }

  const topSkills = Array.from(signals.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
  const value = {
    generatedAt: new Date(),
    topSkills,
    skillMap: new Map(topSkills.map((signal) => [signal.skill.toLowerCase(), signal])),
  };
  cachedIndex = { expiresAt: Date.now() + ttlMs, value };
  return value;
}

export async function shapeJobForTalentPool(input: JobShapingInput): Promise<JobShapingResult> {
  const index = await getTalentPoolSkillIndex();
  const originalSkillsNeeded = uniqueList(input.skillsNeeded || []);
  const niceToHave = uniqueList(input.niceToHaveSkills || []);
  const concepts = inferConcepts(input);

  const mappedSkills: JobShapingResult['poolFitMetadata']['mappedSkills'] = [];
  const candidateSkills: string[] = [...originalSkillsNeeded];

  for (const concept of concepts) {
    const aliases = SKILL_ALIASES[concept] || [];
    const poolBacked = aliases.filter((skill) => index.skillMap.has(skill.toLowerCase()));
    if (!poolBacked.length) continue;
    mappedSkills.push({
      from: concept,
      to: poolBacked.slice(0, 5),
      reason: 'present in current talent pool proof/profile data',
    });
    candidateSkills.push(...poolBacked);
  }

  const weakSkills = originalSkillsNeeded.filter((skill) => !index.skillMap.has(skill.toLowerCase()));
  const topPoolFallbacks = index.topSkills
    .filter((signal) => signal.projectCount > 0)
    .map((signal) => signal.skill)
    .filter((skill) => !weakSkills.some((weak) => weak.toLowerCase() === skill.toLowerCase()))
    .slice(0, 3);

  if (candidateSkills.length < 3) candidateSkills.push(...topPoolFallbacks);

  const matchingSkills = uniqueList(candidateSkills).slice(0, 10);
  const addedSkills = matchingSkills.filter(
    (skill) => !originalSkillsNeeded.some((original) => original.toLowerCase() === skill.toLowerCase())
  );
  const shapedNiceToHave = uniqueList([...niceToHave, ...addedSkills.slice(0, 5)]).slice(0, 10);
  const poolBackedCount = matchingSkills.filter((skill) => index.skillMap.has(skill.toLowerCase())).length;

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
      topPoolSkills: index.topSkills.slice(0, 10).map((signal) => signal.skill),
    },
  };
}
