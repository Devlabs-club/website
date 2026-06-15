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
  fundingStage?: string | null;
  productDescription?: string | null;
  techStackHints?: string[];
  founderBio?: string | null;
  enriched?: boolean;
};

export function formatFounderStartupContextForPrompt(ctx: FounderStartupContext): string {
  if (!ctx.company && !ctx.startupSummary && !ctx.productDescription) return '';

  const lines = ['[Startup context — from onboarding research]'];
  if (ctx.company) lines.push(`- Company: ${ctx.company}`);
  if (ctx.startupSummary) lines.push(`- Summary: ${ctx.startupSummary}`);
  if (ctx.productDescription && ctx.productDescription !== ctx.startupSummary) {
    lines.push(`- Product: ${ctx.productDescription}`);
  }
  if (ctx.industry) lines.push(`- Industry: ${ctx.industry}`);
  if (ctx.fundingStage) lines.push(`- Stage: ${ctx.fundingStage}`);
  if (ctx.techStackHints?.length) {
    lines.push(`- Likely stack/domain: ${ctx.techStackHints.join(', ')}`);
  }
  if (ctx.founderBio) lines.push(`- Founder background: ${ctx.founderBio}`);
  if (ctx.enriched) {
    lines.push(
      '- You already researched this founder/company at onboarding. Do not re-ask company name or "what are you building".'
    );
  }
  return `\n\n${lines.join('\n')}`;
}

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
  seniority: string | null;
  fundingStage: string | null;
  deliverables: string[];
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
  const seniority = cleanStr(args.seniority);
  const fundingStage = cleanStr(args.fundingStage);
  const deliverables = normalizeStringArray(args.deliverables);

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
    seniority,
    fundingStage,
    deliverables,
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
  if (fields.seniority) opportunity.seniority = fields.seniority;
  if (fields.fundingStage) opportunity.fundingStage = fields.fundingStage;
  if (fields.deliverables.length > 0) opportunity.deliverables = fields.deliverables;
}

