import { resolveCompanyLogoUrl } from '@/lib/talent/companyLogo';

const EMPLOYMENT_TYPE_AS_COMPANY =
  /^(full[-\s]?time|part[-\s]?time|internship|intern|contract|contractor|freelance|self[-\s]?employed|temporary|seasonal|permanent|volunteer|apprenticeship|co-?op|coop)$/i;

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function isEmploymentTypeLabel(value: string | null | undefined): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  return EMPLOYMENT_TYPE_AS_COMPANY.test(text);
}

export function normalizeExperienceCompany(company: string | null | undefined): string | null {
  const text = String(company || '').trim();
  if (!text) return null;
  if (isEmploymentTypeLabel(text)) return null;
  return text;
}

function isPresentLabel(value: string | null | undefined): boolean {
  return /\b(present|current|now)\b/i.test(String(value || ''));
}

function splitDateRange(dateRange: string | null | undefined): { start: string; end: string } {
  const parts = String(dateRange || '')
    .split(/\s*[–—−-]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    start: parts[0] || '',
    end: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

/** Parse a date fragment like "Jul 2026" or "2024" into a comparable timestamp. */
export function parseExperienceDateToken(value: string | null | undefined): number {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (isPresentLabel(text)) return Number.MAX_SAFE_INTEGER;

  const withMonth = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d{2}|19\d{2})\b/i
  );
  if (withMonth) {
    const month = MONTH_INDEX[withMonth[1].slice(0, 3).toLowerCase()] ?? 0;
    return Date.UTC(Number(withMonth[2]), month, 1);
  }

  const yearOnly = text.match(/\b(20\d{2}|19\d{2})\b/);
  return yearOnly ? Date.UTC(Number(yearOnly[1]), 11, 31) : 0;
}

export function experienceIsCurrent(entry: {
  isCurrent?: boolean;
  endDateLabel?: string | null;
  dateRange?: string | null;
} | null | undefined): boolean {
  if (!entry) return false;
  if (entry.isCurrent) return true;
  if (isPresentLabel(entry.endDateLabel)) return true;
  return isPresentLabel(splitDateRange(entry.dateRange).end);
}

function experienceEndSortKey(entry: any): number {
  if (experienceIsCurrent(entry)) return Number.MAX_SAFE_INTEGER;
  const endLabel = entry?.endDateLabel || splitDateRange(entry?.dateRange).end;
  return parseExperienceDateToken(endLabel);
}

function experienceStartSortKey(entry: any): number {
  const startLabel = entry?.startDateLabel || splitDateRange(entry?.dateRange).start;
  return parseExperienceDateToken(startLabel);
}

/** Newest / current roles first (Present at top). */
export function sortExperiencesByRecency<T extends Record<string, any>>(
  experiences: T[] | null | undefined
): T[] {
  if (!Array.isArray(experiences) || experiences.length <= 1) {
    return experiences ? [...experiences] : [];
  }
  return [...experiences].sort((a, b) => {
    const endDiff = experienceEndSortKey(b) - experienceEndSortKey(a);
    if (endDiff !== 0) return endDiff;
    return experienceStartSortKey(b) - experienceStartSortKey(a);
  });
}

export function normalizeFounderFacingExperience(entry: any) {
  if (!entry || typeof entry !== 'object') return null;
  const title = typeof entry.title === 'string' ? entry.title.trim() : '';
  const rawCompany = typeof entry.company === 'string' ? entry.company.trim() : '';
  const company = normalizeExperienceCompany(rawCompany);
  const employmentType =
    typeof entry.employmentType === 'string' && entry.employmentType.trim()
      ? entry.employmentType.trim()
      : isEmploymentTypeLabel(rawCompany)
        ? rawCompany
        : null;

  if (!title && !company) return null;

  const companyLinkedInUrl =
    typeof entry.companyLinkedInUrl === 'string' && entry.companyLinkedInUrl.trim()
      ? entry.companyLinkedInUrl.trim()
      : null;
  const storedLogo =
    typeof entry.companyLogoUrl === 'string' && entry.companyLogoUrl.trim()
      ? entry.companyLogoUrl.trim()
      : null;

  const dateRange = typeof entry.dateRange === 'string' && entry.dateRange.trim() ? entry.dateRange.trim() : null;
  const endDateLabel =
    typeof entry.endDateLabel === 'string' && entry.endDateLabel.trim() ? entry.endDateLabel.trim() : null;

  return {
    ...entry,
    title: title || 'Role',
    company: company || 'Independent',
    employmentType,
    companyLinkedInUrl,
    companyLogoUrl: company
      ? resolveCompanyLogoUrl(company, storedLogo, companyLinkedInUrl)
      : storedLogo,
    location: typeof entry.location === 'string' && entry.location.trim() ? entry.location.trim() : null,
    dateRange,
    endDateLabel,
    description:
      typeof entry.description === 'string' && entry.description.trim() ? entry.description.trim() : null,
    isCurrent: experienceIsCurrent({ isCurrent: entry.isCurrent, endDateLabel, dateRange }),
  };
}

export function normalizeFounderFacingExperiences(experiences: any[] | null | undefined, limit = 8) {
  if (!Array.isArray(experiences)) return [];
  return sortExperiencesByRecency(
    experiences
      .map((entry) => normalizeFounderFacingExperience(entry))
      .filter(Boolean) as Record<string, any>[]
  ).slice(0, limit);
}
