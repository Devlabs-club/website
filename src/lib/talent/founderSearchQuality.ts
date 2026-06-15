export type OpportunityLike = {
  company?: string | null;
  roleTitle?: string | null;
  roleType?: string[] | null;
  builderWillDo?: string | null;
  startupSummary?: string | null;
  skillsNeeded?: string[] | null;
  niceToHaveSkills?: string[] | null;
  hireType?: 'full_time' | 'internship' | 'either' | null;
  workType?: string | null;
  timeline?: string | null;
  budget?: string | null;
  locationPreference?: string | null;
  availabilityNeeded?: string | null;
  seniority?: string | null;
  hoursPerWeek?: string | null;
  deliverables?: string[] | null;
  fundingStage?: string | null;
  industry?: string | null;
  status?: string | null;
  skippedFields?: string[] | null;
};

export type FieldCheck = {
  key: string;
  label: string;
  check: (o: OpportunityLike) => boolean;
};

export const REQUIRED_FIELD_CHECKS: FieldCheck[] = [
  {
    key: 'roleTitle',
    label: 'Role',
    check: (o) => Boolean(String(o.roleTitle || '').trim()) && o.roleTitle !== 'New role',
  },
  {
    key: 'builderWillDo',
    label: 'What they build',
    check: (o) => Boolean(String(o.builderWillDo || o.startupSummary || '').trim()),
  },
  {
    key: 'skillsNeeded',
    label: 'Skills',
    check: (o) => Array.isArray(o.skillsNeeded) && o.skillsNeeded.length > 0,
  },
  { key: 'workType', label: 'Work type', check: (o) => Boolean(String(o.workType || o.hireType || '').trim()) },
  { key: 'timeline', label: 'Timeline', check: (o) => Boolean(String(o.timeline || '').trim()) },
  {
    key: 'locationPreference',
    label: 'Location',
    check: (o) =>
      Boolean(String(o.locationPreference || o.availabilityNeeded || '').trim()),
  },
];

export const OPTIONAL_FIELD_CHECKS: FieldCheck[] = [
  {
    key: 'budget',
    label: 'Budget',
    check: (o) => Boolean(String(o.budget || '').trim()),
  },
  {
    key: 'startupSummary',
    label: 'Startup context',
    check: (o) => Boolean(String(o.startupSummary || '').trim()),
  },
  {
    key: 'fundingStage',
    label: 'Funding stage',
    check: (o) => Boolean(String(o.fundingStage || '').trim()),
  },
  {
    key: 'seniority',
    label: 'Seniority',
    check: (o) => Boolean(String(o.seniority || '').trim()),
  },
  {
    key: 'niceToHaveSkills',
    label: 'Nice-to-have skills',
    check: (o) => Array.isArray(o.niceToHaveSkills) && o.niceToHaveSkills.length > 0,
  },
  {
    key: 'deliverables',
    label: 'Example deliverable',
    check: (o) => Array.isArray(o.deliverables) && o.deliverables.length > 0,
  },
];

const SKIP_PATTERNS =
  /\b(skip|skip that|not needed|ignore|leave blank|no thanks|pass on that|don't need)\b/i;

const DONE_PATTERNS =
  /\b(that'?s it|that is it|we'?re good|i'?m good|nothing else|no more|ready to search|run (the )?search|good to go)\b/i;

export function isSkipMessage(text: string): boolean {
  return SKIP_PATTERNS.test(text.trim());
}

export function isDoneMessage(text: string): boolean {
  return DONE_PATTERNS.test(text.trim());
}

export function wantsStartupContextHelp(text: string): boolean {
  return /\b(more (startup|company) context|improve (the )?company|add context)\b/i.test(text);
}

export function getSkippedFields(opportunity: OpportunityLike | null): string[] {
  return Array.isArray(opportunity?.skippedFields) ? opportunity!.skippedFields! : [];
}

export function isFieldSkipped(opportunity: OpportunityLike | null, fieldKey: string): boolean {
  return getSkippedFields(opportunity).includes(fieldKey);
}

export function getMissingRequiredFields(
  opportunity: OpportunityLike,
  skipped: string[] = getSkippedFields(opportunity)
): string[] {
  return REQUIRED_FIELD_CHECKS.filter(
    (f) => !skipped.includes(f.key) && !f.check(opportunity)
  ).map((f) => f.label);
}

export function getMissingOptionalFields(
  opportunity: OpportunityLike,
  skipped: string[] = getSkippedFields(opportunity)
): string[] {
  return OPTIONAL_FIELD_CHECKS.filter(
    (f) => !skipped.includes(f.key) && !f.check(opportunity)
  ).map((f) => f.label);
}

export function getFilledRequiredFields(opportunity: OpportunityLike): string[] {
  return REQUIRED_FIELD_CHECKS.filter((f) => f.check(opportunity)).map((f) => f.label);
}

export function getFilledOptionalFields(opportunity: OpportunityLike): string[] {
  return OPTIONAL_FIELD_CHECKS.filter((f) => f.check(opportunity)).map((f) => f.label);
}

export type SearchQualityRating = 'Good' | 'Fair' | 'Needs work';

export function getSearchQualityRating(opportunity: OpportunityLike): SearchQualityRating {
  const missing = getMissingRequiredFields(opportunity);
  if (missing.length === 0) return 'Good';
  if (missing.length <= 2) return 'Fair';
  return 'Needs work';
}

export function canRunPreviewAnyway(opportunity: OpportunityLike): boolean {
  const hasRole = REQUIRED_FIELD_CHECKS[0].check(opportunity);
  const hasBuild =
    REQUIRED_FIELD_CHECKS[1].check(opportunity) ||
    Boolean(String(opportunity.startupSummary || '').trim());
  const hasSkills = REQUIRED_FIELD_CHECKS[2].check(opportunity);
  return hasRole && hasBuild && hasSkills;
}

export function buildPreviewExplanation(
  opportunity: OpportunityLike,
  totalMatches: number,
  strongMatchCount: number
): string | null {
  if (strongMatchCount > 0 || totalMatches === 0) return null;

  const lines: string[] = ['Why 0 strong matches?'];
  if (totalMatches === 1) {
    lines.push('- Only one builder met the minimum bar for this brief.');
    lines.push('- Tighten skills or broaden work type/location to surface more strong matches.');
  } else {
    lines.push('- Matches exist but none cleared the strong-match threshold for this brief.');
    lines.push('- Refine required skills, or run preview anyway to review possibles.');
  }
  return lines.join('\n');
}

export function inferSkipFieldKey(text: string, opportunity: OpportunityLike): string | null {
  const lower = text.toLowerCase();
  const missingRequired = REQUIRED_FIELD_CHECKS.filter(
    (f) => !isFieldSkipped(opportunity, f.key) && !f.check(opportunity)
  );
  const missingOptional = OPTIONAL_FIELD_CHECKS.filter(
    (f) => !isFieldSkipped(opportunity, f.key) && !f.check(opportunity)
  );
  const next = [...missingRequired, ...missingOptional][0];
  if (!next) return null;
  if (isSkipMessage(text)) return next.key;
  return null;
}

export function applyEditFromText(
  userText: string,
  opportunity: OpportunityLike
): Partial<OpportunityLike> {
  const lower = userText.toLowerCase();
  const updates: Partial<OpportunityLike> = {};

  if (
    /change.*(ml|ai).*(full[- ]?stack|fullstack)/i.test(userText) ||
    /(ml|ai).*(to|→).*full[- ]?stack/i.test(userText)
  ) {
    updates.roleTitle = 'Full Stack Developer';
    updates.roleType = ['full_stack'];
    updates.skillsNeeded = ['React', 'TypeScript', 'Node.js', 'Full-stack'];
    updates.builderWillDo =
      opportunity.builderWillDo?.replace(/\b(ai|ml|machine learning)\b/gi, 'full-stack') ||
      'Full-stack development for the product — ship features across frontend and backend.';
    return updates;
  }

  if (/full[- ]?stack/i.test(lower) && /(change|update|switch)/i.test(lower)) {
    updates.roleTitle = updates.roleTitle || 'Full Stack Developer';
    updates.roleType = ['full_stack'];
  }

  const budgetMatch = userText.match(/budget[:\s]+([^.]+)/i);
  if (budgetMatch) updates.budget = budgetMatch[1].trim();

  const timelineMatch = userText.match(/(\d+)\s*(weeks?|months?)/i);
  if (timelineMatch && /(timeline|within|by)/i.test(lower)) updates.timeline = timelineMatch[0];

  if (/remote/i.test(lower) && /(location|remote)/i.test(lower)) updates.locationPreference = 'Remote';

  return updates;
}

export function matchCandidateByName(
  query: string,
  candidates: Array<{ name: string; builderId: string }>
): { name: string; builderId: string } | null {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!q) return null;
  for (const c of candidates) {
    const n = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n.includes(q) || q.includes(n) || n.startsWith(q) || q.startsWith(n)) return c;
  }
  return null;
}

export function buildCandidateAnswer(candidate: {
  name: string;
  matchLabel: string;
  whyTheyMatch: string | null;
  riskFlags: string[];
  recommendedNextStep: string;
  topSkills: string[];
  projects: Array<{ projectName: string; description?: string | null }>;
  proofStrengthLabel: string;
}): string {
  const proof =
    candidate.projects.length > 0
      ? candidate.projects
          .slice(0, 2)
          .map((p) => p.projectName)
          .join(', ')
      : 'Limited project proof on file';

  const strengths = [
    candidate.matchLabel,
    candidate.whyTheyMatch || 'Aligned skills for this role',
    `Proof: ${proof} (${candidate.proofStrengthLabel})`,
    candidate.topSkills.length ? `Skills: ${candidate.topSkills.slice(0, 5).join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n- ');

  const risks =
    candidate.riskFlags.length > 0
      ? candidate.riskFlags.map((r) => `- ${r}`).join('\n')
      : '- No major risks flagged';

  return `**${candidate.name}** for this role:\n\n**Strengths**\n- ${strengths}\n\n**Risks**\n${risks}\n\n**Recommendation**\n${candidate.recommendedNextStep}`;
}
