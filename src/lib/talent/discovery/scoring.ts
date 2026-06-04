import type { RankingWeights } from './strategy';

export type CandidateScoreComponents = {
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
  llmRerankAdjustment: number;
};

export type CandidateExplanation = {
  strongestSignals: string[];
  concerns: string[];
  missingEvidence: string[];
  bestUseCase: string;
  recommendedAction: 'request_intro' | 'send_trial' | 'save' | 'reject' | 'review_more';
};

export type ScoredCandidate = {
  builderId: string;
  overallFit: number;
  components: CandidateScoreComponents;
  confidence: 'low' | 'medium' | 'high';
  explanation: CandidateExplanation;
  matchLabel: 'Strong Match' | 'Good Match' | 'Possible Match' | 'Weak Match';
  retrievalSources: string[];
};

export function computeOverallFit(components: CandidateScoreComponents, weights: RankingWeights): number {
  const raw =
    components.deterministicSkillFit * weights.deterministicSkillFit +
    components.semanticRoleFit * weights.semanticRoleFit +
    components.semanticProjectFit * weights.semanticProjectFit +
    components.proofStrength * weights.proofStrength +
    components.contributionClarity * weights.contributionClarity +
    components.founderPreferenceFit * weights.founderPreferenceFit +
    components.hireTypeFit * weights.hireTypeFit +
    components.availabilityFit * weights.availabilityFit +
    components.profileQuality * weights.profileQuality +
    components.startupReadiness * weights.startupReadiness -
    components.negativeSignalPenalty * weights.negativeSignalPenalty -
    components.missingEvidencePenalty * weights.missingEvidencePenalty +
    components.llmRerankAdjustment;

  return Math.max(0, Math.min(1, raw));
}

export function scoreMatchLabel(overallFit: number): ScoredCandidate['matchLabel'] {
  if (overallFit >= 0.75) return 'Strong Match';
  if (overallFit >= 0.55) return 'Good Match';
  if (overallFit >= 0.35) return 'Possible Match';
  return 'Weak Match';
}

export function scoreConfidence(components: CandidateScoreComponents): ScoredCandidate['confidence'] {
  const hasSemantic = components.semanticProjectFit > 0 || components.semanticRoleFit > 0;
  const hasProof = components.proofStrength > 0.4;
  const hasClarity = components.contributionClarity > 0.4;
  if (hasSemantic && hasProof && hasClarity) return 'high';
  if (hasProof || hasClarity) return 'medium';
  return 'low';
}

export function scoreBuilderFromProfile(params: {
  builder: any;
  projects: any[];
  opportunity: any;
  mustHaveSignals: string[];
  proofSignals: string[];
  founderMemoryContext?: string;
}): CandidateScoreComponents {
  const { builder, projects, opportunity, mustHaveSignals } = params;

  const deterministicSkillFit = scoreDeterministicSkill(builder, projects, opportunity, mustHaveSignals);
  const proofStrength = scoreProofStrength(projects);
  const contributionClarity = scoreContributionClarity(projects);
  const hireTypeFit = scoreHireTypeFit(builder, opportunity);
  const availabilityFit = scoreAvailabilityFit(builder, opportunity);
  const profileQuality = scoreProfileQuality(builder);
  const startupReadiness = scoreStartupReadiness(builder, projects);
  const missingEvidencePenalty = scoreMissingEvidence(builder, projects, opportunity);

  return {
    deterministicSkillFit,
    semanticRoleFit: 0,
    semanticProjectFit: 0,
    proofStrength,
    contributionClarity,
    founderPreferenceFit: 0,
    hireTypeFit,
    availabilityFit,
    profileQuality,
    startupReadiness,
    negativeSignalPenalty: 0,
    missingEvidencePenalty,
    llmRerankAdjustment: 0,
  };
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

const SKILL_ALIASES: Record<string, string[]> = {
  gcp: ['gcp', 'google cloud', 'google cloud platform'],
  golang: ['golang', 'go'],
  go: ['golang', 'go'],
  'ci/cd': ['ci/cd', 'cicd', 'continuous integration', 'github actions'],
  devops: ['devops', 'docker', 'kubernetes', 'terraform'],
  serverless: ['serverless', 'lambda', 'cloud functions'],
};

function skillTerms(input: string): string[] {
  const n = norm(input).replace(/\s+/g, ' ');
  return SKILL_ALIASES[n] || [n];
}

function scoreDeterministicSkill(builder: any, projects: any[], opportunity: any, mustHaveSignals: string[]): number {
  const required: string[] = [
    ...(opportunity.skillsNeeded || []),
    ...(opportunity.roleType || []),
    ...mustHaveSignals,
  ].map(norm);

  if (!required.length) return 0.5;

  const builderSkills = new Set<string>([
    ...(builder.rolePreference || []).flatMap((s: string) => skillTerms(s)),
    ...projects.flatMap((p: any) => (p.techStack || []).flatMap((s: string) => skillTerms(s))),
  ]);

  let matched = 0;
  for (const req of required) {
    const reqTerms = skillTerms(req);
    if (reqTerms.some((t) => builderSkills.has(t))) matched++;
  }

  return Math.min(1, matched / Math.max(required.length, 1));
}

function scoreProofStrength(projects: any[]): number {
  if (!projects.length) return 0;

  const VERIFIED = new Set(['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified']);
  let score = 0;

  for (const p of projects) {
    let projectScore = 0;
    if (VERIFIED.has(p.verificationStatus)) projectScore += 0.3;
    if (p.links?.github) projectScore += 0.2;
    if (p.links?.demo || p.links?.devpost) projectScore += 0.2;
    if (p.builderContribution && p.builderContribution.length > 30) projectScore += 0.2;
    if (p.description && p.description.length > 50) projectScore += 0.1;
    score = Math.max(score, Math.min(1, projectScore));
  }

  const multiProjectBonus = Math.min(0.2, (projects.length - 1) * 0.05);
  return Math.min(1, score + multiProjectBonus);
}

function scoreContributionClarity(projects: any[]): number {
  if (!projects.length) return 0;

  const VERIFIED = new Set(['builder_confirmed', 'peer_confirmed', 'admin_verified', 'founder_verified']);
  let total = 0;

  for (const p of projects) {
    const contrib = p.builderContribution || '';
    let s = 0;
    if (contrib.length > 20) s += 0.4;
    if (contrib.length > 80) s += 0.2;
    if (VERIFIED.has(p.verificationStatus)) s += 0.3;
    if (p.problemSolved && p.problemSolved.length > 20) s += 0.1;
    total += Math.min(1, s);
  }

  return total / projects.length;
}

function scoreHireTypeFit(builder: any, opportunity: any): number {
  const oppHireType = opportunity.hireType || opportunity.workType || 'either';

  if (oppHireType === 'either') return 1.0;

  const builderTypes: string[] = builder.preferredWorkType || builder.hiringIntent?.preferredHireTypes || [];
  if (!builderTypes.length) return 0.5;

  if (builderTypes.includes(oppHireType)) return 1.0;
  if (oppHireType === 'full_time' && builderTypes.includes('full_time')) return 1.0;
  if (oppHireType === 'internship' && builderTypes.includes('internship')) return 1.0;

  return 0.3;
}

function scoreAvailabilityFit(builder: any, opportunity: any): number {
  const avail = builder.availability || {};
  if (!avail.availableNow) return 0.1;

  let score = 0.6;
  if (avail.hoursPerWeek && avail.hoursPerWeek >= 20) score += 0.2;
  if (avail.hoursPerWeek && avail.hoursPerWeek >= 40) score += 0.2;

  const locationPref = opportunity.locationPreference || '';
  const remoteOk = !locationPref || /remote/i.test(locationPref);
  const builderRemote = avail.remotePreference;
  if (!remoteOk && builderRemote === 'remote') score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

function scoreProfileQuality(builder: any): number {
  const quality = builder.profileQuality;
  if (!quality) return 0.3;
  const raw = (quality.overallScore || 0) / 100;
  return Math.min(1, raw);
}

function scoreStartupReadiness(builder: any, projects: any[]): number {
  let score = 0;

  if (projects.length >= 2) score += 0.2;
  if (projects.some((p: any) => p.links?.github || p.links?.demo)) score += 0.2;
  if (builder.availability?.availableNow) score += 0.2;
  if (builder.links?.github) score += 0.15;
  if ((builder.rolePreference || []).length >= 2) score += 0.15;
  if (builder.headline && builder.headline.length > 20) score += 0.1;

  return Math.min(1, score);
}

function scoreMissingEvidence(builder: any, projects: any[], opportunity: any): number {
  let penalty = 0;

  if (!projects.length) penalty += 0.5;
  if (!builder.links?.github && !projects.some((p: any) => p.links?.github)) penalty += 0.2;
  if (!projects.some((p: any) => p.builderContribution && p.builderContribution.length > 20)) penalty += 0.2;
  if (!builder.headline) penalty += 0.1;

  return Math.min(1, penalty);
}

export function buildCandidateExplanation(params: {
  builder: any;
  projects: any[];
  components: CandidateScoreComponents;
  opportunity: any;
  searchStrategy: { proofSignals: string[] };
}): CandidateExplanation {
  const { builder, projects, components } = params;
  const strongestSignals: string[] = [];
  const concerns: string[] = [];
  const missingEvidence: string[] = [];

  if (components.deterministicSkillFit >= 0.7) strongestSignals.push('Strong skill match for required stack');
  if (components.proofStrength >= 0.6) strongestSignals.push('Has verified proof-of-work with links');
  if (components.contributionClarity >= 0.6) strongestSignals.push('Clear personal contribution on projects');
  if (components.startupReadiness >= 0.6) strongestSignals.push('Available and startup-ready');
  if (components.availabilityFit >= 0.8) strongestSignals.push('Available now with sufficient hours');

  if (projects.length > 0) {
    const best = projects[0];
    if (best.projectName) strongestSignals.push(`Relevant project: ${best.projectName}`);
  }

  if (components.deterministicSkillFit < 0.4) concerns.push('Skill match below threshold for required stack');
  if (components.proofStrength < 0.4) concerns.push('Limited proof-of-work visibility');
  if (components.contributionClarity < 0.3) concerns.push('Contribution claims are unclear or unverified');
  if (components.availabilityFit < 0.3) concerns.push('Availability may not meet role needs');
  if (components.hireTypeFit < 0.5) concerns.push('Hire type preference may not align');

  if (!builder.links?.github) missingEvidence.push('No GitHub link');
  if (!projects.length) missingEvidence.push('No projects');
  if (!projects.some((p: any) => p.builderContribution?.length > 20)) missingEvidence.push('No clear contribution statements');
  if (!projects.some((p: any) => p.links?.demo || p.links?.devpost)) missingEvidence.push('No demo or Devpost links');

  const overallFit = components.deterministicSkillFit + components.proofStrength + components.contributionClarity;
  const recommendedAction: CandidateExplanation['recommendedAction'] =
    overallFit >= 2.0 ? 'request_intro'
    : overallFit >= 1.4 ? 'save'
    : missingEvidence.length >= 3 ? 'review_more'
    : 'send_trial';

  return {
    strongestSignals: strongestSignals.slice(0, 4),
    concerns: concerns.slice(0, 3),
    missingEvidence: missingEvidence.slice(0, 3),
    bestUseCase: deriveBestUseCase(builder, projects, params.opportunity),
    recommendedAction,
  };
}

function deriveBestUseCase(builder: any, projects: any[], opportunity: any): string {
  const skills = (builder.rolePreference || []).slice(0, 3).join(', ');
  const roleTitle = opportunity.roleTitle || 'this role';
  if (projects.length > 0 && projects[0].projectName) {
    return `${roleTitle} — especially ${projects[0].projectName}-style work`;
  }
  return `${roleTitle} work with ${skills || 'their existing stack'}`;
}
