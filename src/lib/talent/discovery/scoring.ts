import type { RankingWeights } from './strategy';
import {
  buildRoleSkillTiers,
  matchedSkills,
  collectBuilderSkillTokens,
  scoreDomainProofStrength,
  scoreRoleAwareSkillFit,
  type RoleSkillTiers,
} from './roleSkillTiers';
import { buildRequirementFindings, scoreFounderPreferenceFit } from '@/lib/talent/searchTokens';

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
  agentTraceFit: number;
  negativeSignalPenalty: number;
  missingEvidencePenalty: number;
  llmRerankAdjustment: number;
};

export type CandidateExplanation = {
  strongestSignals: string[];
  concerns: string[];
  missingEvidence: string[];
  requirementFindings?: Array<{
    text: string;
    met: 'yes' | 'partial' | 'no';
    evidence: string;
  }>;
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
    components.startupReadiness * weights.startupReadiness +
    components.agentTraceFit * weights.agentTraceFit -
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
  roleSkillTiers?: RoleSkillTiers;
  hasUploadedAgentTrace?: boolean;
  agentWrappedScore?: number | null;
}): CandidateScoreComponents {
  const {
    builder,
    projects,
    opportunity,
    mustHaveSignals,
    roleSkillTiers,
    hasUploadedAgentTrace,
    agentWrappedScore,
  } = params;
  const tiers = roleSkillTiers || buildRoleSkillTiers(opportunity);
  const domainProof = scoreDomainProofStrength(tiers, projects);
  const proofStrength = Math.min(1, scoreProofStrength(projects) * 0.45 + domainProof * 0.55);
  const contributionClarity = scoreContributionClarity(projects);
  const hireTypeFit = scoreHireTypeFit(builder, opportunity);
  const availabilityFit = scoreAvailabilityFit(builder, opportunity);
  const profileQuality = scoreProfileQuality(builder);
  const startupReadiness = scoreStartupReadiness(builder, projects);
  const missingEvidencePenalty = scoreMissingEvidence(builder, projects, opportunity);
  const founderPreferenceFit = scoreFounderPreferenceFit(opportunity, builder, projects);
  const agentTraceFit = scoreAgentTraceFit(hasUploadedAgentTrace, agentWrappedScore);

  return {
    deterministicSkillFit,
    semanticRoleFit: 0,
    semanticProjectFit: 0,
    proofStrength,
    contributionClarity,
    founderPreferenceFit,
    hireTypeFit,
    availabilityFit,
    profileQuality,
    startupReadiness,
    agentTraceFit,
    negativeSignalPenalty: 0,
    missingEvidencePenalty,
    llmRerankAdjustment: 0,
  };
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function normalizeSkillTerm(input: string): string {
  return norm(input).replace(/\s+/g, ' ');
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
  let score = avail.availableNow ? 0.85 : 0.5;

  const locationPref = opportunity.locationPreference || '';
  const remoteOk = !locationPref || /remote/i.test(locationPref);
  const builderRemote = avail.remotePreference;
  if (!remoteOk && builderRemote === 'remote') score -= 0.1;

  return Math.max(0.35, Math.min(1, score));
}

function scoreProfileQuality(builder: any): number {
  const quality = builder.profileQuality;
  if (!quality) return 0.3;
  const raw = (quality.overallScore || 0) / 100;
  return Math.min(1, raw);
}

function scoreStartupReadiness(builder: any, projects: any[]): number {
  let score = 0;

  if (projects.length >= 2) score += 0.25;
  if (projects.some((p: any) => p.links?.github || p.links?.demo || p.links?.devpost)) score += 0.25;
  if (builder.links?.github) score += 0.2;
  if ((builder.rolePreference || []).length >= 2) score += 0.15;
  if (builder.headline && builder.headline.length > 20) score += 0.15;

  return Math.min(1, score);
}

function scoreAgentTraceFit(hasUploadedAgentTrace?: boolean, agentWrappedScore?: number | null): number {
  if (!hasUploadedAgentTrace) return 0;
  let score = 0.65;
  if (typeof agentWrappedScore === 'number') {
    score += Math.min(0.35, agentWrappedScore / 100 * 0.35);
  }
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
  roleSkillTiers?: RoleSkillTiers;
}): CandidateExplanation {
  const { builder, projects, components, opportunity, roleSkillTiers } = params;
  const tiers = roleSkillTiers || buildRoleSkillTiers(opportunity);
  const tokens = collectBuilderSkillTokens(builder, projects);
  const primaryHits = matchedSkills(tiers.primarySkills, tokens);
  const requirementFindings = buildRequirementFindings(opportunity, builder, projects);
  const strongestSignals: string[] = [];
  const concerns: string[] = [];
  const missingEvidence: string[] = [];

  if (primaryHits.length) {
    strongestSignals.push(`Core role skills: ${primaryHits.slice(0, 4).join(', ')}`);
  }
  if (components.deterministicSkillFit >= 0.7) strongestSignals.push('Strong skill match for required stack');
  if (components.proofStrength >= 0.6) strongestSignals.push('Has verified proof-of-work with links');
  if (components.contributionClarity >= 0.6) strongestSignals.push('Clear personal contribution on projects');
  if (components.startupReadiness >= 0.6) strongestSignals.push('Strong shipped-project proof');
  if (components.founderPreferenceFit >= 0.75) strongestSignals.push('Matches founder search requirements');
  if (components.agentTraceFit >= 0.6) strongestSignals.push('Verified agent trace uploaded');
  if (components.availabilityFit >= 0.8) strongestSignals.push('Available now');
  else if (components.deterministicSkillFit >= 0.55) strongestSignals.push('Strong skill fit — availability unconfirmed');

  const metRequirements = requirementFindings.filter((finding) => finding.met === 'yes');
  if (metRequirements.length) {
    strongestSignals.push(
      `Requirements met: ${metRequirements.slice(0, 2).map((finding) => finding.text).join('; ')}`
    );
  }

  if (projects.length > 0) {
    const best = projects[0];
    if (best.projectName) strongestSignals.push(`Relevant project: ${best.projectName}`);
  }

  if (tiers.requiresPrimaryMatch && primaryHits.length === 0) {
    concerns.push('No direct match on core role-domain skills');
  }
  if (components.deterministicSkillFit < 0.4) concerns.push('Skill match below threshold for required stack');
  if (components.proofStrength < 0.4) concerns.push('Limited proof-of-work visibility');
  if (components.contributionClarity < 0.3) concerns.push('Contribution claims are unclear or unverified');
  if (components.availabilityFit < 0.55) concerns.push('Not marked available now — confirm timing in intro');
  if (components.hireTypeFit < 0.5) concerns.push('Hire type preference may not align');
  const unmetMust = requirementFindings.filter(
    (finding) => finding.met === 'no' && opportunity.searchRequirements?.some(
      (req: any) => req.text === finding.text && req.importance === 'must'
    )
  );
  if (unmetMust.length) {
    concerns.push(`Missing must-have: ${unmetMust.slice(0, 2).map((finding) => finding.text).join('; ')}`);
  }

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
    strongestSignals: strongestSignals.slice(0, 5),
    concerns: concerns.slice(0, 3),
    missingEvidence: missingEvidence.slice(0, 3),
    requirementFindings: requirementFindings.length ? requirementFindings : undefined,
    bestUseCase: deriveBestUseCase(builder, projects, opportunity),
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
