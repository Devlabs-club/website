import type { OpportunityLike } from '@/lib/talent/founderSearchQuality';

export const PLACEHOLDER_COMPANY = 'Your startup';
export const PLACEHOLDER_ROLE_TITLE = 'New role';

const GENERIC_COMPANIES = new Set(
  [PLACEHOLDER_COMPANY, 'Startup', 'My startup', 'My company', 'Company', 'TBD', 'N/A'].map((s) =>
    s.toLowerCase()
  )
);

export type FounderStartupContext = {
  company: string | null;
  startupSummary: string | null;
  industry: string | null;
};

export type SanitizedRoleBriefFields = {
  roleTitle: string | null;
  company: string | null;
  startupSummary: string | null;
  builderWillDo: string | null;
  skillsNeeded: string[];
  niceToHaveSkills: string[];
  hireType: 'full_time' | 'internship' | 'either' | null;
  workType: string | null;
  timeline: string | null;
  budget: string | null;
  locationPreference: string | null;
  industry: string | null;
};

function cleanStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isPlaceholderCompany(value: string | null | undefined): boolean {
  if (!value) return true;
  return GENERIC_COMPANIES.has(value.trim().toLowerCase());
}

export function isPlaceholderRoleTitle(value: string | null | undefined): boolean {
  if (!value) return true;
  const t = value.trim().toLowerCase();
  return t === PLACEHOLDER_ROLE_TITLE.toLowerCase() || t === 'new role' || t === 'role' || t === 'tbd';
}

export function userMentionedCompensation(text: string): boolean {
  return /\b(budget|compensation|salary|pay|rate|price|\$|\d+k\b|\d+\s*\/\s*hr|equity)\b/i.test(
    text
  );
}

function normalizeHireType(value: unknown): SanitizedRoleBriefFields['hireType'] {
  const ht = cleanStr(value);
  if (ht === 'full_time' || ht === 'internship' || ht === 'either') return ht;
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Keep only tool/LLM fields that look like real founder-provided data. */
export function sanitizeRoleBriefArgs(
  args: Record<string, unknown>,
  founderContext: FounderStartupContext,
  userText: string
): SanitizedRoleBriefFields {
  const allowBudget = userMentionedCompensation(userText);

  let roleTitle = cleanStr(args.roleTitle);
  if (isPlaceholderRoleTitle(roleTitle)) roleTitle = null;

  let company = cleanStr(args.company);
  if (isPlaceholderCompany(company)) company = null;
  if (!company && founderContext.company) company = founderContext.company;

  let startupSummary = cleanStr(args.startupSummary) || founderContext.startupSummary;
  let builderWillDo = cleanStr(args.builderWillDo);
  let timeline = cleanStr(args.timeline);
  let locationPreference = cleanStr(args.locationPreference);
  let budget = allowBudget ? cleanStr(args.budget) : null;
  const industry = cleanStr(args.industry) || founderContext.industry;

  const hireType = normalizeHireType(args.hireType);
  const skillsNeeded = normalizeStringArray(args.skillsNeeded);
  const niceToHaveSkills = normalizeStringArray(args.niceToHaveSkills);

  return {
    roleTitle,
    company,
    startupSummary,
    builderWillDo,
    skillsNeeded,
    niceToHaveSkills,
    hireType,
    workType: hireType,
    timeline,
    budget,
    locationPreference,
    industry,
  };
}

export function applySanitizedToOpportunity(
  opportunity: OpportunityLike,
  fields: SanitizedRoleBriefFields
): void {
  if (fields.roleTitle) opportunity.roleTitle = fields.roleTitle;
  if (fields.company && !isPlaceholderCompany(fields.company)) opportunity.company = fields.company;
  if (fields.startupSummary) opportunity.startupSummary = fields.startupSummary;
  if (fields.builderWillDo) opportunity.builderWillDo = fields.builderWillDo;
  if (fields.industry) opportunity.industry = fields.industry;
  if (fields.hireType) {
    opportunity.hireType = fields.hireType;
    opportunity.workType = fields.hireType;
  }
  if (fields.timeline) opportunity.timeline = fields.timeline;
  if (fields.budget) opportunity.budget = fields.budget;
  if (fields.locationPreference) {
    opportunity.locationPreference = fields.locationPreference;
    opportunity.availabilityNeeded = fields.locationPreference;
  }
  if (fields.skillsNeeded.length > 0) opportunity.skillsNeeded = fields.skillsNeeded;
  if (fields.niceToHaveSkills.length > 0) opportunity.niceToHaveSkills = fields.niceToHaveSkills;
}

export function extractRoleHintsFromUserText(userText: string): Partial<SanitizedRoleBriefFields> {
  const text = userText.trim();
  if (!text) return {};

  const hints: Partial<SanitizedRoleBriefFields> = {};

  const buildingMatch = text.match(
    /(?:we'?re building|i'?m building|building)\s+(.+?)(?:\.\s+|\.\s*|,\s*|\s+i need|\s+and i need)/i
  );
  if (buildingMatch) hints.startupSummary = buildingMatch[1].trim();

  const atCompany = text.match(/\bat\s+([A-Z][A-Za-z0-9&.\-\s]{1,60})(?:\s*[,.]|$)/);
  if (atCompany && !isPlaceholderCompany(atCompany[1])) {
    hints.company = atCompany[1].trim();
  }

  const needMatch = text.match(
    /(?:i need|looking for|hire|hiring)\s+(?:a\s+)?(.+?)(?:\.\s+|\.\s*|,\s*|\s+in the|\s+within|\s+for\s+the|\s+over)/i
  );
  if (needMatch) {
    const role = needMatch[1].trim();
    if (!isPlaceholderRoleTitle(role)) {
      hints.roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  const timelineMatch = text.match(/(\d+)\s*(weeks?|months?|days?)/i);
  if (timelineMatch) hints.timeline = timelineMatch[0];

  if (userMentionedCompensation(text)) {
    const budgetMatch = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?|\d+k(?:\s*[-–]\s*\d+k)?/i);
    if (budgetMatch) hints.budget = budgetMatch[0];
  }

  if (/remote/i.test(text)) hints.locationPreference = 'Remote';
  if (/full[- ]?time/i.test(text)) hints.hireType = 'full_time';
  else if (/intern(ship)?/i.test(text)) hints.hireType = 'internship';
  else if (/either|open to both|both work/i.test(text)) hints.hireType = 'either';

  const skillMatches = text.match(
    /\b(React|TypeScript|Tailwind|Node\.?js|Python|Flutter|Next\.?js|PostgreSQL|MongoDB|Swift|Kotlin|Figma)\b/gi
  );
  if (skillMatches) {
    hints.skillsNeeded = [...new Set(skillMatches.map((s) => s.charAt(0).toUpperCase() + s.slice(1)))];
  }

  return hints;
}

export function mergeHintsIntoSanitized(
  base: SanitizedRoleBriefFields,
  hints: Partial<SanitizedRoleBriefFields>
): SanitizedRoleBriefFields {
  return {
    ...base,
    roleTitle: base.roleTitle || hints.roleTitle || null,
    company: base.company || hints.company || null,
    startupSummary: base.startupSummary || hints.startupSummary || null,
    builderWillDo: base.builderWillDo || hints.builderWillDo || null,
    timeline: base.timeline || hints.timeline || null,
    budget: base.budget || hints.budget || null,
    locationPreference: base.locationPreference || hints.locationPreference || null,
    hireType: base.hireType || hints.hireType || null,
    workType: base.workType || hints.hireType || null,
    skillsNeeded:
      base.skillsNeeded.length > 0
        ? base.skillsNeeded
        : hints.skillsNeeded && hints.skillsNeeded.length > 0
          ? hints.skillsNeeded
          : [],
    niceToHaveSkills:
      base.niceToHaveSkills.length > 0 ? base.niceToHaveSkills : hints.niceToHaveSkills || [],
  };
}
