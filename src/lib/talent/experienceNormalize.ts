import { resolveCompanyLogoUrl } from '@/lib/talent/companyLogo';

const EMPLOYMENT_TYPE_AS_COMPANY =
  /^(full[-\s]?time|part[-\s]?time|internship|intern|contract|contractor|freelance|self[-\s]?employed|temporary|seasonal|permanent|volunteer|apprenticeship|co-?op|coop)$/i;

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
    dateRange: typeof entry.dateRange === 'string' && entry.dateRange.trim() ? entry.dateRange.trim() : null,
    description:
      typeof entry.description === 'string' && entry.description.trim() ? entry.description.trim() : null,
  };
}

export function normalizeFounderFacingExperiences(experiences: any[] | null | undefined, limit = 8) {
  if (!Array.isArray(experiences)) return [];
  return experiences
    .map((entry) => normalizeFounderFacingExperience(entry))
    .filter(Boolean)
    .slice(0, limit);
}
