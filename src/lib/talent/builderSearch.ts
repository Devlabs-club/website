export type OpportunityLike = {
  _id?: unknown;
  company?: string | null;
  startupSummary?: string | null;
  industry?: string | null;
  roleTitle?: string | null;
  roleType?: string[] | null;
  workType?: string | null;
  skillsNeeded?: string[] | null;
  timeline?: string | null;
  budget?: string | null;
  locationPreference?: string | null;
  availabilityNeeded?: string | null;
  builderWillDo?: string | null;
  successIn30Days?: string | null;
};

export type MatchLabel = 'Strong Match' | 'Good Match' | 'Possible Match';

export type ComponentScores = {
  skillFit: number;
  proofRelevance: number;
  availabilityFit: number;
  workTypeFit: number;
  domainRelevance: number;
  profileQuality: number;
};

export type RankedBuilderMatch = {
  builderId: string;
  matchScore: number;
  matchLabel: MatchLabel;
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

const ANONYMOUS_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `Candidate ${l}`);

const VERIFIED_PROJECT_STATUSES = new Set([
  'builder_confirmed',
  'peer_confirmed',
  'admin_verified',
  'founder_verified',
]);

function norm(s: string) {
  return s.toLowerCase().trim();
}

function tokenize(text: string): string[] {
  return norm(text)
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function fuzzySkillMatch(required: string, haystack: Set<string>): boolean {
  const r = norm(required);
  if (haystack.has(r)) return true;
  for (const h of haystack) {
    if (h.includes(r) || r.includes(h)) return true;
  }
  return false;
}

function scoreSkillFit(
  builder: any,
  projects: any[],
  opportunity: OpportunityLike
): number {
  const required = [
    ...(opportunity.skillsNeeded || []),
    ...(opportunity.roleTitle ? tokenize(opportunity.roleTitle) : []),
    ...(opportunity.roleType || []),
  ].filter(Boolean);

  if (required.length === 0) return 0.55;

  const haystack = new Set<string>();
  (builder.rolePreference || []).forEach((s: string) => haystack.add(norm(s)));
  projects.forEach((p) => {
    (p.techStack || []).forEach((s: string) => haystack.add(norm(s)));
    (p.contributionTags || []).forEach((s: string) => haystack.add(norm(s)));
  });

  const matches = required.filter((skill) => fuzzySkillMatch(String(skill), haystack));
  return Math.min(1, matches.length / Math.min(required.length, 6));
}

function scoreProofRelevance(builder: any, projects: any[]): number {
  let score = 0;
  const verified = projects.filter((p) => VERIFIED_PROJECT_STATUSES.has(p.verificationStatus));
  const pool = verified.length ? verified : projects;

  if (pool.length === 0) {
    const proofScore = builder.profileCompletion?.proofScore ?? 0;
    return Math.min(1, proofScore / 100);
  }

  score += Math.min(0.45, pool.length * 0.15);
  const withContribution = pool.filter(
    (p) => p.builderContribution && String(p.builderContribution).length > 20
  );
  score += Math.min(0.35, withContribution.length * 0.12);

  const withStack = pool.filter((p) => Array.isArray(p.techStack) && p.techStack.length > 0);
  score += Math.min(0.2, withStack.length * 0.08);

  return Math.min(1, score);
}

function scoreAvailabilityFit(builder: any, opportunity: OpportunityLike): number {
  const avail = builder.availability || {};
  let score = 0;

  if (avail.availableNow) score += 0.55;
  else score += 0.15;

  const hours = avail.hoursPerWeek || 0;
  if (hours >= 20) score += 0.35;
  else if (hours >= 10) score += 0.25;
  else if (hours > 0) score += 0.12;

  const remote = norm(avail.remotePreference || 'unspecified');
  const loc = norm(opportunity.locationPreference || opportunity.availabilityNeeded || '');
  if (!loc || loc.includes('remote') || remote === 'remote' || remote === 'unspecified') {
    score += 0.1;
  } else if (loc.includes('hybrid') && remote === 'hybrid') {
    score += 0.1;
  }

  return Math.min(1, score);
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

  const keywords = new Set(tokenize(corpus));
  if (keywords.size === 0) return 0.5;

  const projectText = projects
    .map((p) => [p.description, p.problemSolved, p.builderContribution, ...(p.techStack || [])].join(' '))
    .join(' ')
    .toLowerCase();

  let hits = 0;
  keywords.forEach((kw) => {
    if (projectText.includes(kw)) hits += 1;
  });

  return Math.min(1, hits / Math.min(keywords.size, 8));
}

function scoreProfileQuality(builder: any): number {
  const overall = builder.profileQuality?.overallScore ?? builder.profileCompletion?.profileScore ?? 0;
  const clarity = builder.profileQuality?.founderClarity?.score ?? 0;
  const blended = overall * 0.6 + clarity * 0.4;
  return Math.min(1, blended / 100);
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
  const verified = projects.filter((p) => VERIFIED_PROJECT_STATUSES.has(p.verificationStatus));
  const pool = verified.length ? verified : projects;

  if (pool.length === 0) {
    return 'Limited verified proof-of-work on profile.';
  }

  const stacks = Array.from(
    new Set(pool.flatMap((p) => (p.techStack || []).map((s: string) => String(s))))
  ).slice(0, 4);

  const withContribution = pool.filter(
    (p) => p.builderContribution && String(p.builderContribution).length > 15
  ).length;

  const parts = [
    `${pool.length} verified project${pool.length === 1 ? '' : 's'} with documented build history.`,
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
    const hrs = a.hoursPerWeek ? `${a.hoursPerWeek} hrs/week` : 'flexible hours';
    const remote = a.remotePreference && a.remotePreference !== 'unspecified'
      ? ` · ${String(a.remotePreference).replace('_', ' ')}`
      : '';
    return `Available now · ${hrs}${remote}`;
  }
  if (a.hoursPerWeek) {
    return `Limited availability · ${a.hoursPerWeek} hrs/week`;
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
      proofRelevance: scoreProofRelevance(builder, projects),
      availabilityFit: scoreAvailabilityFit(builder, opportunity),
      workTypeFit: scoreWorkTypeFit(builder, opportunity),
      domainRelevance: scoreDomainRelevance(projects, opportunity),
      profileQuality: scoreProfileQuality(builder),
    };

    const matchScore = Math.round(
      (componentScores.skillFit * 0.3 +
        componentScores.proofRelevance * 0.25 +
        componentScores.availabilityFit * 0.15 +
        componentScores.workTypeFit * 0.1 +
        componentScores.domainRelevance * 0.1 +
        componentScores.profileQuality * 0.1) *
        100
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
          (componentScores.proofRelevance + componentScores.profileQuality) / 2
        ),
      },
      builder,
      projects,
    });
  }

  ranked.sort((a, b) => b.matchScore - a.matchScore);
  return ranked.slice(0, limit);
}

export function toAnonymousCandidates(matches: RankedBuilderMatch[], previewCount = 6) {
  return matches.slice(0, previewCount).map((entry, index) => ({
    anonymousLabel: ANONYMOUS_LABELS[index] || `Candidate ${index + 1}`,
    builderId: entry.builderId,
    matchScore: entry.matchScore,
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
    previewGeneratedAt: plain.previewGeneratedAt,
    candidates: (plain.candidates || []).map((c: any) => ({
      anonymousLabel: c.anonymousLabel,
      matchScore: c.matchScore,
      matchLabel: c.matchLabel,
      roleType: c.roleType,
      topSkills: c.topSkills || [],
      proofSummary: c.proofSummary,
      availabilitySummary: c.availabilitySummary,
      whyTheyMatch: c.whyTheyMatch,
    })),
  };
}

export function buildTalentPreviewUiBlock(shortlist: any, opportunity: OpportunityLike) {
  const pub = toPublicShortlist(shortlist);
  return {
    type: 'talent_preview',
    title: `Preview · ${opportunity.roleTitle || 'Role'}`,
    body: `${pub?.totalMatches ?? 0} potential matches · ${pub?.strongMatchCount ?? 0} strong matches`,
    meta: {
      opportunityId: String(opportunity._id || shortlist?.opportunityId),
      locked: !pub?.unlocked,
      totalMatches: pub?.totalMatches,
      strongMatchCount: pub?.strongMatchCount,
      candidates: pub?.candidates || [],
    },
  };
}
