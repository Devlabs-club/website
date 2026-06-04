export type HireType = 'full_time' | 'internship' | 'either';

export type SearchMode = 'broad' | 'balanced' | 'strict';

export type RankingWeights = {
  deterministicSkillFit: number;
  semanticRoleFit: number;
  semanticProjectFit: number;
  proofStrength: number;
  contributionClarity: number;
  founderPreferenceFit: number;
  hireTypeFit: number;
  availabilityFit: number;
  profileQuality: number;
  startupReadiness: number;
  negativeSignalPenalty: number;
  missingEvidencePenalty: number;
};

export const DEFAULT_WEIGHTS: RankingWeights = {
  deterministicSkillFit: 0.15,
  semanticRoleFit: 0.15,
  semanticProjectFit: 0.15,
  proofStrength: 0.15,
  contributionClarity: 0.10,
  founderPreferenceFit: 0.10,
  hireTypeFit: 0.08,
  availabilityFit: 0.07,
  profileQuality: 0.05,
  startupReadiness: 0.10,
  negativeSignalPenalty: 0.10,
  missingEvidencePenalty: 0.05,
};

export const MVP_SPRINT_WEIGHTS: RankingWeights = {
  deterministicSkillFit: 0.10,
  semanticRoleFit: 0.10,
  semanticProjectFit: 0.20,
  proofStrength: 0.25,
  contributionClarity: 0.10,
  founderPreferenceFit: 0.05,
  hireTypeFit: 0.05,
  availabilityFit: 0.10,
  profileQuality: 0.05,
  startupReadiness: 0.15,
  negativeSignalPenalty: 0.10,
  missingEvidencePenalty: 0.05,
};

export const BACKEND_ENGINEER_WEIGHTS: RankingWeights = {
  deterministicSkillFit: 0.20,
  semanticRoleFit: 0.10,
  semanticProjectFit: 0.10,
  proofStrength: 0.25,
  contributionClarity: 0.20,
  founderPreferenceFit: 0.05,
  hireTypeFit: 0.05,
  availabilityFit: 0.05,
  profileQuality: 0.05,
  startupReadiness: 0.05,
  negativeSignalPenalty: 0.15,
  missingEvidencePenalty: 0.10,
};

export type SearchStrategy = {
  opportunityId: string;
  founderId: string;
  primaryQuery: string;
  expandedQueries: string[];
  mustHaveSignals: string[];
  niceToHaveSignals: string[];
  negativeSignals: string[];
  proofSignals: string[];
  semanticConcepts: string[];
  searchMode: SearchMode;
  weights: RankingWeights;
  createdBy: 'agent' | 'founder';
  createdAt: Date;
};

export type OpportunityInput = {
  _id?: unknown;
  roleTitle?: string | null;
  builderWillDo?: string | null;
  skillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
  hireType?: string | null;
  workType?: string | null;
  startupSummary?: string | null;
  industry?: string | null;
  timeline?: string | null;
  locationPreference?: string | null;
};

export function buildSearchStrategy(params: {
  opportunity: OpportunityInput;
  founderId: string;
  searchMode?: SearchMode;
  founderMemoryContext?: string;
}): SearchStrategy {
  const { opportunity, founderId, searchMode = 'balanced' } = params;
  const oppId = String(opportunity._id ?? '');
  const roleTitle = opportunity.roleTitle ?? '';
  const builderWillDo = opportunity.builderWillDo ?? '';
  const skills = opportunity.skillsNeeded ?? [];
  const niceToHave = opportunity.niceToHaveSkills ?? [];

  const primaryQuery = [roleTitle, builderWillDo].filter(Boolean).join(' — ');

  const expandedQueries = buildExpandedQueries(roleTitle, builderWillDo, skills);
  const mustHaveSignals = skills.slice(0, 5);
  const niceToHaveSignals = niceToHave.slice(0, 5);
  const proofSignals = buildProofSignals(roleTitle, skills, builderWillDo);
  const semanticConcepts = buildSemanticConcepts(roleTitle, skills, builderWillDo);
  const negativeSignals: string[] = [];

  const weights = selectWeights(roleTitle, opportunity.hireType ?? opportunity.workType ?? '', searchMode);

  return {
    opportunityId: oppId,
    founderId,
    primaryQuery,
    expandedQueries,
    mustHaveSignals,
    niceToHaveSignals,
    negativeSignals,
    proofSignals,
    semanticConcepts,
    searchMode,
    weights,
    createdBy: 'agent',
    createdAt: new Date(),
  };
}

function buildExpandedQueries(roleTitle: string, builderWillDo: string, skills: string[]): string[] {
  const queries: string[] = [];
  const lower = (roleTitle + ' ' + builderWillDo).toLowerCase();

  if (skills.length >= 2) {
    queries.push(skills.slice(0, 3).join(' ') + ' developer');
  }

  const isFullStack = /full[\s-]?stack|full stack/i.test(lower);
  const isFrontend = /frontend|front[\s-]end|react|next\.?js|vue|svelte/i.test(lower);
  const isBackend = /backend|back[\s-]end|api|node|python|fastapi|django|express/i.test(lower);
  const isAI = /ai|llm|openai|gpt|langchain|rag|vector|embedding|ml|machine learning/i.test(lower);
  const isMobile = /mobile|ios|android|react native|flutter|expo/i.test(lower);
  const isDashboard = /dashboard|admin|analytics|saas|platform/i.test(lower);

  if (isFullStack) {
    queries.push('full-stack shipped MVP proof-of-work');
    queries.push('frontend backend auth database deployed');
  }
  if (isFrontend && !isFullStack) {
    queries.push('React Next.js frontend shipped product');
    queries.push('UI component design system Tailwind');
  }
  if (isBackend) {
    queries.push('backend API REST database auth ownership');
    queries.push('Node Python infrastructure server-side');
  }
  if (isAI) {
    queries.push('LLM OpenAI API integration product');
    queries.push('RAG vector search embedding pipeline');
    queries.push('AI SaaS shipped demo');
  }
  if (isMobile) {
    queries.push('mobile app React Native Flutter shipped app store');
    queries.push('iOS Android Expo personal project');
  }
  if (isDashboard) {
    queries.push('SaaS dashboard auth roles database Next.js');
    queries.push('analytics platform shipped full-stack');
  }

  if (builderWillDo) {
    queries.push(builderWillDo.slice(0, 80));
  }

  return [...new Set(queries)].slice(0, 6);
}

function buildProofSignals(roleTitle: string, skills: string[], builderWillDo: string): string[] {
  const signals: string[] = [];
  const lower = (roleTitle + ' ' + builderWillDo).toLowerCase();

  signals.push('shipped project with personal contribution');
  signals.push('GitHub or Devpost link');
  signals.push('demo or deployed product');

  if (/ai|llm|openai|gpt/i.test(lower)) signals.push('AI API integration proof');
  if (/mobile|ios|android/i.test(lower)) signals.push('published or demo mobile app');
  if (/stripe|payment|billing/i.test(lower)) signals.push('payment integration proof');
  if (/auth|login|signup|user/i.test(lower)) signals.push('auth system implementation');
  if (/database|sql|mongo|postgres/i.test(lower)) signals.push('database schema and queries');

  for (const skill of skills.slice(0, 3)) {
    signals.push(`${skill} project proof`);
  }

  return [...new Set(signals)].slice(0, 8);
}

function buildSemanticConcepts(roleTitle: string, skills: string[], builderWillDo: string): string[] {
  const concepts: Set<string> = new Set();
  const all = (roleTitle + ' ' + builderWillDo + ' ' + skills.join(' ')).toLowerCase();

  if (/ai|llm|gpt|openai/i.test(all)) concepts.add('AI product development');
  if (/dashboard|saas|platform/i.test(all)) concepts.add('SaaS product building');
  if (/mobile|ios|android/i.test(all)) concepts.add('mobile app development');
  if (/full.?stack/i.test(all)) concepts.add('full-stack web development');
  if (/backend|api|server/i.test(all)) concepts.add('backend systems and APIs');
  if (/frontend|react|next|ui/i.test(all)) concepts.add('frontend product engineering');
  if (/ml|machine learning|model|training/i.test(all)) concepts.add('machine learning engineering');
  if (/infra|devops|deploy|cloud|aws|gcp/i.test(all)) concepts.add('cloud infrastructure');
  if (/auth|oauth|security/i.test(all)) concepts.add('authentication and security');
  if (/data|analytics|pipeline/i.test(all)) concepts.add('data engineering and analytics');

  concepts.add('startup-ready builder');
  concepts.add('shipped project proof-of-work');

  return Array.from(concepts).slice(0, 8);
}

function selectWeights(roleTitle: string, hireType: string, searchMode: SearchMode): RankingWeights {
  const lower = roleTitle.toLowerCase();
  const isBackendHeavy = /backend|infrastructure|devops|data engineer|platform/i.test(lower);
  const isMVP = /mvp|prototype|sprint|rapid|hackathon/i.test(lower);

  let base = isBackendHeavy ? BACKEND_ENGINEER_WEIGHTS
    : isMVP ? MVP_SPRINT_WEIGHTS
    : DEFAULT_WEIGHTS;

  if (searchMode === 'broad') {
    base = { ...base, deterministicSkillFit: base.deterministicSkillFit * 0.7, proofStrength: base.proofStrength * 0.8 };
  } else if (searchMode === 'strict') {
    base = { ...base, deterministicSkillFit: base.deterministicSkillFit * 1.3, proofStrength: base.proofStrength * 1.2 };
  }

  return base;
}
