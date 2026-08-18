import { scoreLocationFit } from '@/lib/talent/builderLocation';

export type OpportunityLike = {
  _id?: unknown;
  company?: string | null;
  startupSummary?: string | null;
  industry?: string | null;
  roleTitle?: string | null;
  roleType?: string[] | null;
  workType?: string | null;
  skillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
  timeline?: string | null;
  budget?: string | null;
  locationPreference?: string | null;
  location?: string | null;
  workMode?: string | null;
  availabilityNeeded?: string | null;
  builderWillDo?: string | null;
  deliverables?: string[] | null;
};

export type MatchLabel = 'Strong Match' | 'Good Match' | 'Possible Match';

export type ComponentScores = {
  skillFit: number;
  specializedFit: number;
  proofRelevance: number;
  evidenceQuality: number;
  availabilityFit: number;
  workTypeFit: number;
  domainRelevance: number;
  profileQuality: number;
};

export type RankedBuilderMatch = {
  builderId: string;
  matchScore: number;
  matchLabel: MatchLabel;
  profileStrength: number;
  rankingStrength: number;
  componentScores: ComponentScores;
  roleType: string;
  topSkills: string[];
  proofSummary: string;
  availabilitySummary: string;
  whyTheyMatch: string;
  signals: {
    skillMatch: 'low' | 'medium' | 'high';
    proofOfWork: 'low' | 'medium' | 'high';
    availability: 'low' | 'medium' | 'high';
    startupReadiness: 'low' | 'medium' | 'high';
  };
  builder: any;
  projects: any[];
};


const VERIFIED_PROJECT_STATUSES = new Set([
  'builder_confirmed',
  'peer_confirmed',
  'admin_verified',
  'founder_verified',
]);

const SHORT_TECH_TOKENS = new Set(['ai', 'ml', 'go', 'js', 'ts', 'c#', 'c++', 'c']);

function norm(s: string) {
  return s.toLowerCase().trim();
}

function normalizeSkillTerm(input: string) {
  return norm(input).replace(/\s+/g, ' ');
}

function tokenize(text: string): string[] {
  return norm(text)
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 || SHORT_TECH_TOKENS.has(t));
}

const ROLE_TOKEN_STOPWORDS = new Set([
  'founding',
  'founder',
  'senior',
  'junior',
  'lead',
  'principal',
  'engineer',
  'developer',
  'builder',
  'intern',
  'role',
  'full',
  'stack',
  'product',
]);

const DOMAIN_TOKEN_STOPWORDS = new Set([
  ...ROLE_TOKEN_STOPWORDS,
  'with',
  'from',
  'that',
  'this',
  'they',
  'will',
  'need',
  'needs',
  'build',
  'ship',
  'shipping',
  'using',
  'used',
  'user',
  'users',
  'app',
  'apps',
  'platform',
  'system',
  'systems',
  'tool',
  'tools',
  'team',
  'teams',
  'startup',
  'startups',
  'internal',
  'data',
  'source',
  'sources',
  'usage',
  'production',
]);

const BROAD_TECH_TERMS = new Set([
  'javascript',
  'js',
  'typescript',
  'ts',
  'python',
  'java',
  'react',
  'react.js',
  'reactjs',
  'next',
  'next.js',
  'nextjs',
  'node',
  'node.js',
  'nodejs',
  'frontend',
  'backend',
  'full-stack',
  'fullstack',
  'web',
  'mobile',
]);

function isSpecializedRequirement(term: string) {
  const normalized = norm(term).replace(/\s+/g, ' ');
  if (!normalized || BROAD_TECH_TERMS.has(normalized)) return false;
  if (SHORT_TECH_TOKENS.has(normalized) && !['ai', 'ml'].includes(normalized)) return false;
  return true;
}

function isUsefulRoleToken(token: string) {
  return (token.length >= 4 || SHORT_TECH_TOKENS.has(token)) && !ROLE_TOKEN_STOPWORDS.has(token);
}

function isUsefulDomainToken(token: string) {
  return token.length >= 5 && !DOMAIN_TOKEN_STOPWORDS.has(token);
}

function fuzzySkillMatch(required: string, haystack: Set<string>): boolean {
  const r = normalizeSkillTerm(required);
  if (haystack.has(r)) return true;
  for (const h of haystack) {
    if (h === r) return true;
    if (r.length < 4 || h.length < 4) continue;
    if (h.includes(r) || r.includes(h)) return true;
    const rTokens = new Set(tokenize(r));
    const hTokens = new Set(tokenize(h));
    const requiredTokens = [...rTokens].filter((token) => token.length >= 4);
    if (requiredTokens.length > 1 && requiredTokens.every((token) => hTokens.has(token))) {
      return true;
    }
  }
  return false;
}

function addSearchText(haystack: Set<string>, value: unknown) {
  if (!value) return;
  const raw = Array.isArray(value) ? value.join(' ') : String(value);
  const normalized = norm(raw);
  if (!normalized) return;
  haystack.add(normalized);
  tokenize(raw).forEach((token) => haystack.add(token));
}

function buildTextSet(values: unknown[]) {
  const haystack = new Set<string>();
  values.forEach((value) => addSearchText(haystack, value));
  return haystack;
}

type WeightedRequirement = {
  term: string;
  weight: number;
};

function buildWeightedRequirements(opportunity: OpportunityLike): WeightedRequirement[] {
  const weighted: WeightedRequirement[] = [];
  const add = (term: string, weight: number) => {
    const specializationBoost = isSpecializedRequirement(term) ? 1.45 : 1;
    weighted.push({ term, weight: weight * specializationBoost });
  };

  (opportunity.skillsNeeded || []).forEach((skill) => add(String(skill), 1));
  (opportunity.niceToHaveSkills || []).forEach((skill) => add(String(skill), 0.45));
  (opportunity.roleType || []).forEach((role) => add(String(role), 0.35));
  if (opportunity.roleTitle) {
    tokenize(opportunity.roleTitle)
      .filter(isUsefulRoleToken)
      .forEach((token) => add(token, 0.25));
  }

  const seen = new Set<string>();
  return weighted.filter((item) => {
    const key = norm(item.term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasStrongProjectEvidence(project: any) {
  return (
    VERIFIED_PROJECT_STATUSES.has(project.verificationStatus) ||
    Boolean(project.links?.github || project.links?.demo || project.links?.devpost) ||
    Boolean(project.builderContribution && String(project.builderContribution).length > 30) ||
    (Array.isArray(project.techStack) && project.techStack.length > 0)
  );
}

function buildEvidenceSources(builder: any, projects: any[]) {
  const projectTech = buildTextSet(projects.flatMap((p) => p.techStack || []));
  const projectContribution = buildTextSet(
    projects.flatMap((p) => [p.builderContribution, ...(p.contributionTags || [])])
  );
  const projectNarrative = buildTextSet(
    projects.flatMap((p) => [p.projectName, p.description, p.problemSolved])
  );
  const profileDeclared = buildTextSet([
    ...(builder.rolePreference || []),
    builder.headline,
    builder.bio,
    ...(builder.experiences || []).flatMap((experience: any) => [
      experience?.title,
      experience?.company,
      experience?.description,
      ...(experience?.skills || []),
    ]),
    builder.profileQuality?.oneLineSummary,
    ...(builder.profileQuality?.strengths || []).flatMap((strength: any) => [
      strength?.title,
      strength?.detail,
    ]),
  ]);

  return [
    { haystack: projectTech, weight: 1 },
    { haystack: projectContribution, weight: 0.9 },
    { haystack: projectNarrative, weight: 0.72 },
    { haystack: profileDeclared, weight: 0.62 },
  ];
}

function scoreWeightedRequirements(
  requirements: WeightedRequirement[],
  builder: any,
  projects: any[]
) {
  if (requirements.length === 0) return 0.55;

  const sourceWeights = buildEvidenceSources(builder, projects);
  let earned = 0;
  let possible = 0;
  for (const requirement of requirements) {
    possible += requirement.weight;
    const sourceHit = sourceWeights.find((source) => fuzzySkillMatch(requirement.term, source.haystack));
    if (sourceHit) {
      earned += requirement.weight * sourceHit.weight;
    }
  }

  return Math.min(1, earned / Math.max(possible, 1));
}

function scoreSkillFit(
  builder: any,
  projects: any[],
  opportunity: OpportunityLike
): number {
  const required = buildWeightedRequirements(opportunity);
  return scoreWeightedRequirements(required, builder, projects);
}

function scoreSpecializedFit(
  builder: any,
  projects: any[],
  opportunity: OpportunityLike
): number {
  const specialized = buildWeightedRequirements(opportunity).filter((requirement) =>
    isSpecializedRequirement(requirement.term)
  );
  if (specialized.length === 0) return 0.55;
  return scoreWeightedRequirements(specialized, builder, projects);
}

function scoreProofRelevance(builder: any, projects: any[]): number {
  if (projects.length === 0) {
    const proofScore = builder.profileCompletion?.proofScore ?? 0;
    return Math.min(0.35, proofScore / 100);
  }

  const projectScores = projects.map((project) => {
    let score = 0;
    if (VERIFIED_PROJECT_STATUSES.has(project.verificationStatus)) score += 0.28;
    if (project.links?.github || project.links?.demo || project.links?.devpost) score += 0.2;
    if (project.builderContribution && String(project.builderContribution).length > 30) score += 0.28;
    if (Array.isArray(project.techStack) && project.techStack.length > 0) score += 0.18;
    if (project.description && String(project.description).length > 60) score += 0.06;
    return Math.min(1, score);
  });

  const sorted = [...projectScores].sort((a, b) => b - a);
  const best = sorted[0] || 0;
  const topThreeAvg = sorted.slice(0, 3).reduce((sum, score) => sum + score, 0) / Math.max(1, sorted.slice(0, 3).length);
  const countBonus = Math.min(0.15, projects.filter(hasStrongProjectEvidence).length * 0.04);

  return Math.min(1, best * 0.55 + topThreeAvg * 0.3 + countBonus);
}

function scoreAvailabilityFit(builder: any, opportunity: OpportunityLike): number {
  const avail = builder.availability || {};
  let score = avail.availableNow ? 0.55 : 0.12;
  score += 0.45 * scoreLocationFit(builder, opportunity);
  return Math.min(1, Math.max(0.1, score));
}

function normalizeWorkType(value: string): string {
  return norm(value).replace(/\s+/g, '_');
}

function scoreWorkTypeFit(builder: any, opportunity: OpportunityLike): number {
  const needed = opportunity.workType ? normalizeWorkType(String(opportunity.workType)) : '';
  const preferred = (builder.preferredWorkType || []).map((w: string) => normalizeWorkType(w));

  if (!needed) return 0.6;
  if (preferred.length === 0) return 0.45;

  const aliases: Record<string, string[]> = {
    paid_sprint: ['paid_sprint', 'sprint', 'contract', 'part_time_contract'],
    full_time: ['full_time', 'fulltime'],
    part_time_contract: ['part_time_contract', 'contract', 'part_time'],
    internship: ['internship'],
  };

  const neededVariants = aliases[needed] || [needed];
  const hit = preferred.some((p: string) => neededVariants.includes(p) || p.includes(needed) || needed.includes(p));
  return hit ? 1 : 0.35;
}

function scoreDomainRelevance(projects: any[], opportunity: OpportunityLike): number {
  const corpus = [
    opportunity.startupSummary,
    opportunity.industry,
    opportunity.builderWillDo,
    opportunity.company,
  ]
    .filter(Boolean)
    .join(' ');

  const keywords = new Set(tokenize(corpus).filter(isUsefulDomainToken));
  if (keywords.size === 0) return 0.5;

  const projectTokens = new Set(tokenize(
    projects
    .map((p) => [p.description, p.problemSolved, p.builderContribution, ...(p.techStack || [])].join(' '))
      .join(' ')
  ));

  let hits = 0;
  keywords.forEach((kw) => {
    if (projectTokens.has(kw)) hits += 1;
  });

  return Math.min(1, hits / Math.min(keywords.size, 10));
}

function scoreProfileQuality(builder: any): number {
  const overall = builder.profileQuality?.overallScore ?? builder.profileCompletion?.profileScore ?? 0;
  const clarity = builder.profileQuality?.founderClarity?.score ?? overall;
  const blended = overall * 0.6 + clarity * 0.4;
  return Math.min(1, blended / 100);
}

function hasMalformedName(name: unknown) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 5 && new Set(parts.map((part) => part.toLowerCase())).size <= 3;
}

function scoreEvidenceQuality(builder: any, projects: any[]): number {
  let score = 0;
  if (!hasMalformedName(builder.name)) score += 0.12;
  if ((builder.rolePreference || []).length > 0) score += 0.12;
  if (builder.headline || builder.bio) score += 0.08;
  if (builder.links?.github || builder.links?.portfolio || builder.links?.personalWebsite || builder.links?.resume) {
    score += 0.12;
  }

  if (projects.length > 0) score += 0.12;
  if (projects.some((p) => VERIFIED_PROJECT_STATUSES.has(p.verificationStatus))) score += 0.14;
  if (projects.some((p) => p.links?.github || p.links?.demo || p.links?.devpost)) score += 0.12;
  if (projects.some((p) => p.builderContribution && String(p.builderContribution).length > 30)) score += 0.14;
  if (projects.some((p) => Array.isArray(p.techStack) && p.techStack.length > 0)) score += 0.14;

  if (hasMalformedName(builder.name)) score -= 0.18;

  return Math.max(0, Math.min(1, score));
}

export function profileStrengthScore(builder: any, projects: any[] = []) {
  const quality = builder.profileQuality?.overallScore ?? builder.profileCompletion?.profileScore ?? 0;
  const proof = Math.round(scoreProofRelevance(builder, projects) * 100);
  const clarity = builder.profileQuality?.founderClarity?.score ?? quality;
  const linkScore = [
    builder.links?.github,
    builder.links?.linkedin,
    builder.links?.portfolio || builder.links?.personalWebsite,
    builder.links?.resume,
    builder.links?.devpost,
  ].filter(Boolean).length * 6;
  const projectScore = Math.min(18, projects.filter(hasStrongProjectEvidence).length * 6);
  const evidenceQuality = scoreEvidenceQuality(builder, projects) * 100;
  const malformedPenalty = hasMalformedName(builder.name) ? 28 : 0;
  return Math.max(
    0,
    Math.min(100, Math.round(quality * 0.28 + proof * 0.28 + clarity * 0.16 + evidenceQuality * 0.18 + linkScore + projectScore - malformedPenalty))
  );
}

export function scoreToMatchLabel(score: number): MatchLabel {
  if (score >= 80) return 'Strong Match';
  if (score >= 65) return 'Good Match';
  return 'Possible Match';
}

function signalLevel(value: number): 'low' | 'medium' | 'high' {
  if (value >= 0.75) return 'high';
  if (value >= 0.45) return 'medium';
  return 'low';
}

export function buildAnonymousProofSummary(projects: any[]): string {
  if (projects.length === 0) {
    return 'Limited verified proof-of-work on profile.';
  }

  const verified = projects.filter((p) => VERIFIED_PROJECT_STATUSES.has(p.verificationStatus));
  const pool = verified.length ? verified : projects.filter(hasStrongProjectEvidence);
  const summaryPool = pool.length ? pool : projects;

  const stacks = Array.from(
    new Set(summaryPool.flatMap((p) => (p.techStack || []).map((s: string) => String(s))))
  ).slice(0, 4);

  const withContribution = summaryPool.filter(
    (p) => p.builderContribution && String(p.builderContribution).length > 15
  ).length;

  const parts = [
    verified.length
      ? `${verified.length} verified project${verified.length === 1 ? '' : 's'} with documented build history.`
      : `${summaryPool.length} project${summaryPool.length === 1 ? '' : 's'} with linked or imported proof; verify ownership before moving forward.`,
  ];
  if (withContribution > 0) {
    parts.push(`${withContribution} include clear contribution notes.`);
  }
  if (stacks.length) {
    parts.push(`Stack signals: ${stacks.join(', ')}.`);
  }
  return parts.join(' ');
}

export function buildAvailabilitySummary(builder: any): string {
  const a = builder.availability || {};
  if (a.availableNow) {
    const remote = a.remotePreference && a.remotePreference !== 'unspecified'
      ? ` · ${String(a.remotePreference).replace('_', ' ')}`
      : '';
    return `Available now${remote}`;
  }
  return 'Availability not specified';
}

export function buildWhyTheyMatch(
  opportunity: OpportunityLike,
  components: ComponentScores,
  topSkills: string[]
): string {
  const parts: string[] = [];
  if (components.skillFit >= 0.6 && topSkills.length) {
    parts.push(`Skills align with ${opportunity.roleTitle || 'the role'} (${topSkills.slice(0, 3).join(', ')}).`);
  } else if (components.skillFit >= 0.45) {
    parts.push('Partial skill overlap with your required stack.');
  }
  if (components.proofRelevance >= 0.55) {
    parts.push('Proof-of-work history supports startup shipping pace.');
  } else if (components.evidenceQuality < 0.45) {
    parts.push('Evidence is thin — validate ownership before moving forward.');
  }
  if (components.availabilityFit >= 0.55) {
    parts.push('Availability fits an active hiring timeline.');
  }
  if (components.domainRelevance >= 0.5 && opportunity.industry) {
    parts.push(`Project signals overlap with ${opportunity.industry}.`);
  }
  if (components.profileQuality >= 0.65) {
    parts.push('Profile quality is clear enough for founder evaluation.');
  }
  return parts.length ? parts.join(' ') : 'General fit based on role preferences and builder graph signals.';
}

export function rankBuildersForOpportunity(
  builders: any[],
  projectsByBuilder: Map<string, any[]>,
  opportunity: OpportunityLike,
  limit = 12
): RankedBuilderMatch[] {
  const ranked: RankedBuilderMatch[] = [];

  for (const builder of builders) {
    const builderId = String(builder._id);
    const projects = projectsByBuilder.get(builderId) || [];

    const componentScores: ComponentScores = {
      skillFit: scoreSkillFit(builder, projects, opportunity),
      specializedFit: scoreSpecializedFit(builder, projects, opportunity),
      proofRelevance: scoreProofRelevance(builder, projects),
      evidenceQuality: scoreEvidenceQuality(builder, projects),
      availabilityFit: scoreAvailabilityFit(builder, opportunity),
      workTypeFit: scoreWorkTypeFit(builder, opportunity),
      domainRelevance: scoreDomainRelevance(projects, opportunity),
      profileQuality: scoreProfileQuality(builder),
    };

    const hasSpecificRequirements = Boolean(
      (opportunity.skillsNeeded && opportunity.skillsNeeded.length > 0) ||
      (opportunity.roleType && opportunity.roleType.length > 0) ||
      opportunity.roleTitle
    );
    const hasConcreteSkillList = Boolean(opportunity.skillsNeeded && opportunity.skillsNeeded.length >= 3);
    const hasAnyProfileSignal =
      (builder.rolePreference || []).length > 0 ||
      Boolean(builder.headline || builder.bio || builder.profileQuality?.oneLineSummary);
    const hasAnyProjectEvidence = projects.some(hasStrongProjectEvidence);

    if (
      hasSpecificRequirements &&
      !hasAnyProjectEvidence &&
      (!hasAnyProfileSignal || componentScores.skillFit < 0.25)
    ) {
      continue;
    }

    if (hasConcreteSkillList && componentScores.skillFit < 0.22) {
      continue;
    }

    if (
      hasConcreteSkillList &&
      componentScores.specializedFit < 0.12 &&
      componentScores.skillFit < 0.35
    ) {
      continue;
    }

    if (
      hasSpecificRequirements &&
      componentScores.skillFit < 0.2 &&
      componentScores.domainRelevance < 0.2 &&
      componentScores.proofRelevance < 0.3
    ) {
      continue;
    }

    const matchScore = Math.round(
      (componentScores.skillFit * 0.36 +
        componentScores.specializedFit * 0.18 +
        componentScores.proofRelevance * 0.17 +
        componentScores.evidenceQuality * 0.1 +
        componentScores.domainRelevance * 0.06 +
        componentScores.profileQuality * 0.04 +
        componentScores.workTypeFit * 0.05 +
        componentScores.availabilityFit * 0.04) *
        100
    );
    const profileStrength = profileStrengthScore(builder, projects);
    const rankingStrength = Math.round(
      matchScore * 0.78 +
        profileStrength * 0.17 +
        componentScores.availabilityFit * 5
    );

    const skillSet = new Set<string>();
    (builder.rolePreference || []).forEach((s: string) => skillSet.add(s));
    projects.forEach((p) => (p.techStack || []).forEach((s: string) => skillSet.add(String(s))));
    const topSkills = Array.from(skillSet).slice(0, 6);

    const roleType =
      (builder.rolePreference && builder.rolePreference[0]) ||
      (opportunity.roleType && opportunity.roleType[0]) ||
      opportunity.roleTitle ||
      'Builder';

    ranked.push({
      builderId,
      matchScore,
      matchLabel: scoreToMatchLabel(matchScore),
      profileStrength,
      rankingStrength,
      componentScores,
      roleType: String(roleType),
      topSkills,
      proofSummary: buildAnonymousProofSummary(projects),
      availabilitySummary: buildAvailabilitySummary(builder),
      whyTheyMatch: buildWhyTheyMatch(opportunity, componentScores, topSkills),
      signals: {
        skillMatch: signalLevel(componentScores.skillFit),
        proofOfWork: signalLevel(componentScores.proofRelevance),
        availability: signalLevel(componentScores.availabilityFit),
        startupReadiness: signalLevel(
          (componentScores.proofRelevance + componentScores.evidenceQuality + componentScores.profileQuality) / 3
        ),
      },
      builder,
      projects,
    });
  }

  ranked.sort(
    (a, b) =>
      b.rankingStrength - a.rankingStrength ||
      b.profileStrength - a.profileStrength ||
      b.matchScore - a.matchScore ||
      b.componentScores.skillFit - a.componentScores.skillFit ||
      b.componentScores.proofRelevance - a.componentScores.proofRelevance
  );
  return ranked.slice(0, limit);
}

export function toAnonymousCandidates(matches: RankedBuilderMatch[], previewCount = 6) {
  return matches.slice(0, previewCount).map((entry) => ({
    anonymousLabel: `${entry.roleType || 'Builder'} · ${entry.matchLabel}`,
    builderId: entry.builderId,
    matchScore: entry.matchScore,
    profileStrength: entry.profileStrength,
    matchLabel: entry.matchLabel,
    roleType: entry.roleType,
    topSkills: entry.topSkills,
    proofSummary: entry.proofSummary,
    availabilitySummary: entry.availabilitySummary,
    whyTheyMatch: entry.whyTheyMatch,
  }));
}

export function toPublicShortlist(shortlist: any) {
  if (!shortlist) return null;
  const plain = typeof shortlist.toObject === 'function' ? shortlist.toObject() : shortlist;
  return {
    _id: String(plain._id),
    opportunityId: String(plain.opportunityId),
    unlocked: Boolean(plain.unlocked),
    unlockedAt: plain.unlockedAt || null,
    totalMatches: plain.totalMatches ?? 0,
    strongMatchCount: plain.strongMatchCount ?? 0,
    visibilityMode: plain.visibilityMode || 'full',
    profileLimitApplied: plain.profileLimitApplied ?? null,
    traceAccess: plain.traceAccess || 'full',
    introAccess: plain.introAccess || 'enabled',
    upgradeRequiredFor: plain.upgradeRequiredFor || [],
    teaserMetadata: plain.teaserMetadata || {},
    previewGeneratedAt: plain.previewGeneratedAt,
    candidates: (plain.candidates || []).map((c: any) => ({
      anonymousLabel: c.anonymousLabel,
      matchScore: c.matchScore,
      profileStrength: c.profileStrength ?? 0,
      matchLabel: c.matchLabel,
      roleType: c.roleType,
      topSkills: c.topSkills || [],
      proofSummary: c.proofSummary,
      availabilitySummary: c.availabilitySummary,
      whyTheyMatch: c.whyTheyMatch,
      requirementFindings: c.requirementFindings || [],
    })),
  };
}

export function buildTalentPreviewUiBlock(shortlist: any, opportunity: OpportunityLike) {
  const pub = toPublicShortlist(shortlist);
  const total = pub?.totalMatches ?? 0;
  const strong = pub?.strongMatchCount ?? 0;
  const body =
    total === 0
      ? 'No matching builders found — closest-fit alternatives are not shown'
      : `${total} potential matches · ${strong} strong matches`;
  return {
    type: 'talent_preview',
    title: `Preview · ${opportunity.roleTitle || 'Role'}`,
    body,
    meta: {
      opportunityId: String(opportunity._id || shortlist?.opportunityId),
      locked: !pub?.unlocked,
      totalMatches: pub?.totalMatches,
      strongMatchCount: pub?.strongMatchCount,
      candidates: pub?.candidates || [],
      noRelevantMatches: total === 0,
    },
  };
}
