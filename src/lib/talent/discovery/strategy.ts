import { countMustSearchRequirements } from '@/lib/talent/searchTokens';
import { getPlanRetrievalTerms, type SearchPlan } from '@/lib/talent/searchPlan';
import { buildRoleSkillTiers } from './roleSkillTiers';
import type { RoleSkillTiers } from './roleSkillTiers';

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
  agentTraceFit: number;
  githubActivityFit: number;
  sponsorshipFit: number;
  negativeSignalPenalty: number;
  missingEvidencePenalty: number;
};

export const DEFAULT_WEIGHTS: RankingWeights = {
  deterministicSkillFit: 0.22,
  semanticRoleFit: 0.16,
  semanticProjectFit: 0.16,
  proofStrength: 0.12,
  contributionClarity: 0.08,
  founderPreferenceFit: 0.10,
  hireTypeFit: 0.05,
  availabilityFit: 0.04,
  profileQuality: 0.03,
  startupReadiness: 0.06,
  agentTraceFit: 0.02,
  githubActivityFit: 0.08,
  sponsorshipFit: 0.06,
  negativeSignalPenalty: 0.10,
  missingEvidencePenalty: 0.05,
};

const POSITIVE_WEIGHT_KEYS: Array<keyof RankingWeights> = [
  'deterministicSkillFit',
  'semanticRoleFit',
  'semanticProjectFit',
  'proofStrength',
  'contributionClarity',
  'founderPreferenceFit',
  'hireTypeFit',
  'availabilityFit',
  'profileQuality',
  'startupReadiness',
  'agentTraceFit',
  'githubActivityFit',
  'sponsorshipFit',
];

const PENALTY_WEIGHT_KEYS: Array<keyof RankingWeights> = [
  'negativeSignalPenalty',
  'missingEvidencePenalty',
];

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
  roleSkillTiers: RoleSkillTiers;
  createdBy: 'agent' | 'founder';
  createdAt: Date;
};

export type OpportunityInput = {
  _id?: unknown;
  roleTitle?: string | null;
  builderWillDo?: string | null;
  skillsNeeded?: string[] | null;
  originalSkillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
  requirements?: string[] | null;
  searchRequirements?: Array<{ text?: string | null; importance?: 'must' | 'nice' | string | null }> | null;
  searchPlan?: SearchPlan | null;
  hireType?: string | null;
  workType?: string | null;
  startupSummary?: string | null;
  industry?: string | null;
  timeline?: string | null;
  locationPreference?: string | null;
  visa?: string | null;
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
  const requirementTexts = normalizeRequirementTexts(opportunity);
  const planTerms = getPlanRetrievalTerms(opportunity.searchPlan);

  const roleSkillTiers = buildRoleSkillTiers(opportunity);
  const coreSkills = opportunity.originalSkillsNeeded?.length
    ? opportunity.originalSkillsNeeded
    : skills;
  const primaryQuery = [roleTitle, builderWillDo, ...requirementTexts.slice(0, 2)].filter(Boolean).join(' — ');

  const expandedQueries = uniqueList([
    ...buildExpandedQueries(roleTitle, builderWillDo, coreSkills, requirementTexts),
    ...planTerms.slice(0, 8),
  ]).slice(0, 8);
  const mustHaveSignals = uniqueList([
    ...roleSkillTiers.primarySkills.slice(0, 8),
    ...planTerms.slice(0, 6),
  ]).slice(0, 10);
  const niceToHaveSignals = uniqueList([...niceToHave, ...roleSkillTiers.secondarySkills]).slice(0, 8);
  const proofSignals = buildProofSignals(roleTitle, skills, builderWillDo, requirementTexts);
  const semanticConcepts = buildSemanticConcepts(roleTitle, skills, builderWillDo, requirementTexts);
  const negativeSignals: string[] = [];

  const weights = computeDynamicWeights({ opportunity, roleSkillTiers, searchMode });

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
    roleSkillTiers,
    createdBy: 'agent',
    createdAt: new Date(),
  };
}

function normalizeRequirementTexts(opportunity: OpportunityInput): string[] {
  const structured = (opportunity.searchRequirements || [])
    .map((requirement) => String(requirement?.text || '').trim())
    .filter(Boolean);
  const legacy = (opportunity.requirements || [])
    .map((requirement) => String(requirement || '').trim())
    .filter(Boolean);
  return [...new Set([...structured, ...legacy])].slice(0, 8);
}

function buildExpandedQueries(roleTitle: string, builderWillDo: string, skills: string[], requirements: string[]): string[] {
  const queries: string[] = [];
  const lower = (roleTitle + ' ' + builderWillDo + ' ' + requirements.join(' ')).toLowerCase();

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
  for (const requirement of requirements.slice(0, 4)) {
    queries.push(requirement.slice(0, 120));
  }

  return [...new Set(queries)].slice(0, 6);
}

function buildProofSignals(roleTitle: string, skills: string[], builderWillDo: string, requirements: string[]): string[] {
  const signals: string[] = [];
  const lower = (roleTitle + ' ' + builderWillDo + ' ' + requirements.join(' ')).toLowerCase();

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
  for (const requirement of requirements.slice(0, 3)) {
    signals.push(`${requirement} evidence`);
  }

  return [...new Set(signals)].slice(0, 8);
}

function buildSemanticConcepts(roleTitle: string, skills: string[], builderWillDo: string, requirements: string[]): string[] {
  const concepts: Set<string> = new Set();
  const all = (roleTitle + ' ' + builderWillDo + ' ' + skills.join(' ') + ' ' + requirements.join(' ')).toLowerCase();

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
  requirements.slice(0, 4).forEach((requirement) => concepts.add(requirement));

  return Array.from(concepts).slice(0, 8);
}

function uniqueList(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeRankingWeights(weights: RankingWeights): RankingWeights {
  const normalized = { ...weights };
  const positiveSum = POSITIVE_WEIGHT_KEYS.reduce((sum, key) => sum + normalized[key], 0);
  const penaltySum = PENALTY_WEIGHT_KEYS.reduce((sum, key) => sum + normalized[key], 0);

  if (positiveSum > 0) {
    for (const key of POSITIVE_WEIGHT_KEYS) {
      normalized[key] = normalized[key] / positiveSum;
    }
  }
  if (penaltySum > 0) {
    for (const key of PENALTY_WEIGHT_KEYS) {
      normalized[key] = normalized[key] / penaltySum;
    }
  }

  return normalized;
}

function applyDomainNudges(weights: RankingWeights, domain: RoleSkillTiers['domain']): RankingWeights {
  const next = { ...weights };

  switch (domain) {
    case 'mobile':
    case 'frontend':
      next.deterministicSkillFit += 0.04;
      next.proofStrength += 0.03;
      next.semanticProjectFit += 0.02;
      break;
    case 'backend':
      next.proofStrength += 0.05;
      next.contributionClarity += 0.04;
      break;
    case 'ai':
      next.proofStrength += 0.03;
      next.semanticProjectFit += 0.04;
      next.semanticRoleFit += 0.02;
      break;
    case 'fullstack':
      next.proofStrength += 0.03;
      next.startupReadiness += 0.03;
      break;
    case 'design':
      next.proofStrength += 0.03;
      next.contributionClarity += 0.03;
      break;
    default:
      break;
  }

  return next;
}

export function computeDynamicWeights(params: {
  opportunity: OpportunityInput;
  roleSkillTiers: RoleSkillTiers;
  searchMode: SearchMode;
}): RankingWeights {
  const { opportunity, roleSkillTiers, searchMode } = params;
  let weights: RankingWeights = { ...DEFAULT_WEIGHTS };

  const mustCount = countMustSearchRequirements(opportunity);
  if (mustCount > 0) {
    weights.founderPreferenceFit = Math.min(0.32, 0.12 + mustCount * 0.06);
    weights.negativeSignalPenalty = Math.min(0.18, weights.negativeSignalPenalty + 0.04);
  }

  const visa = String((opportunity as any).visa || '').toLowerCase().trim();
  if (visa !== 'no') {
    // Sponsorship soft signal only applies when the role refuses sponsorship.
    weights.sponsorshipFit = 0.01;
  }

  weights = applyDomainNudges(weights, roleSkillTiers.domain);

  if (searchMode === 'broad') {
    weights.deterministicSkillFit *= 0.85;
    weights.proofStrength *= 0.9;
  } else if (searchMode === 'strict') {
    weights.deterministicSkillFit *= 1.12;
    weights.proofStrength *= 1.08;
    weights.missingEvidencePenalty *= 1.15;
  }

  return normalizeRankingWeights(weights);
}
