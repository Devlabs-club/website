import {
  buildRoleSkillTiers,
  matchedSkills,
  collectBuilderSkillTokens,
} from '@/lib/talent/discovery/roleSkillTiers';
import type { SponsorshipInference } from '@/lib/talent/sponsorshipInference';
import { opportunityDoesNotSponsor } from '@/lib/talent/sponsorshipInference';
import type { GithubActivitySnapshot } from '@/lib/talent/githubActivity';
import { opportunityAsksGithubActivity } from '@/lib/talent/githubActivity';
import {
  buildReasonToHireFromDimensions,
  scoreRoleDimensions,
  type RoleDimensionScore,
} from '@/lib/talent/roleEvidenceDimensions';
import { getPlanEvidenceDimensions } from '@/lib/talent/searchPlan';
export { toFounderFacingWhyHire } from '@/lib/talent/founderFacingWhyHire';

/**
 * Conversation/JD-aware one-liner for recommendation cards.
 * Prefers role-plan evidence dimensions when available.
 */
export function buildConversationAwareWhyTheyMatch(params: {
  builder: any;
  projects: any[];
  opportunity: any;
  components: { deterministicSkillFit?: number };
  requirementFindings?: Array<{ text: string; met: 'yes' | 'partial' | 'no'; evidence: string }>;
  sponsorship?: SponsorshipInference | null;
  githubActivity?: GithubActivitySnapshot | null;
  roleDimensionScore?: RoleDimensionScore | null;
}): string {
  const {
    builder,
    projects,
    opportunity,
    components,
    requirementFindings = [],
    sponsorship,
    githubActivity,
    roleDimensionScore,
  } = params;

  const dimensionScore =
    roleDimensionScore ||
    scoreRoleDimensions({
      dimensions: getPlanEvidenceDimensions(opportunity?.searchPlan),
      builder,
      projects,
    });
  const fromDimensions = buildReasonToHireFromDimensions({
    dimensionScore,
    builder,
    projects,
    roleTitle: opportunity?.roleTitle || opportunity?.title,
  });
  if (fromDimensions) return fromDimensions;

  const tiers = buildRoleSkillTiers(opportunity);
  const tokens = collectBuilderSkillTokens(builder, projects);
  const skillHits = matchedSkills(
    [...tiers.primarySkills, ...(opportunity.skillsNeeded || [])].filter(Boolean),
    tokens
  ).slice(0, 4);

  const parts: string[] = [];
  if (skillHits.length) {
    parts.push(`Matches ${skillHits.join(', ')}`);
  } else if ((components.deterministicSkillFit ?? 0) >= 0.55) {
    parts.push('Solid stack overlap for this role');
  }

  const constraints: string[] = [];
  if (opportunityDoesNotSponsor(opportunity)) {
    if (sponsorship?.need === 'authorized') constraints.push('likely no sponsorship needed');
    else if (sponsorship?.need === 'needs_sponsorship') constraints.push('may need sponsorship');
    else constraints.push('sponsorship unknown');
  }
  if (opportunityAsksGithubActivity(opportunity) && githubActivity?.source === 'github_api') {
    const pct = Math.round((githubActivity.score || 0) * 100);
    if (pct >= 55) constraints.push(`strong GitHub activity (${pct})`);
    else if (pct >= 35) constraints.push(`moderate GitHub activity (${pct})`);
    else constraints.push(`weak GitHub activity (${pct})`);
  }
  const metMusts = requirementFindings
    .filter((finding) => finding.met === 'yes')
    .map((finding) => finding.text)
    .slice(0, 2);
  for (const text of metMusts) {
    if (!/github|sponsorship|visa/i.test(text)) constraints.push(text);
  }
  if (constraints.length) {
    parts.push(`Fits: ${constraints.slice(0, 3).join('; ')}`);
  }

  const proofProject = projects.find((p: any) => p?.projectName) || projects[0];
  const proofExp =
    (Array.isArray(builder?.experiences) ? builder.experiences : []).find(
      (exp: any) => exp?.company && !/^(full|part)[-\s]?time$/i.test(String(exp.company))
    ) || null;
  if (proofProject?.projectName) {
    parts.push(`Proof: ${String(proofProject.projectName).slice(0, 60)}`);
  } else if (proofExp?.company) {
    parts.push(`Proof: ${[proofExp.title, proofExp.company].filter(Boolean).join(' at ').slice(0, 60)}`);
  }

  const flags: string[] = [];
  const unmet = requirementFindings.filter((finding) => finding.met === 'no').slice(0, 2);
  for (const finding of unmet) {
    flags.push(`unmet: ${finding.text}`);
  }
  if (opportunityDoesNotSponsor(opportunity) && sponsorship?.need === 'unknown') {
    flags.push('sponsorship unknown');
  }
  if (flags.length) {
    parts.push(`Note: ${flags.slice(0, 2).join('; ')}`);
  }

  const blurb = parts.filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();
  return blurb.slice(0, 280) || 'Relevant skills and project proof for this role.';
}
