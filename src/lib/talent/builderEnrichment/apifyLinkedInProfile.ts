import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import { parseLinkedInVanityName } from './linkedinVoyager';
import type { EnrichedProfileDraft } from './types';
import {
  ensureLinkedInAvatar,
  ensureOrganizationLogo,
  hasCloudinaryConfig,
  isCloudinaryUrl,
} from '@/lib/talent/enrichmentCloudinary';
import { fetchBrightDataOrganizationLogo } from './brightDataCompanyLogo';

const APIFY_ACTOR = 'harvestapi~linkedin-profile-scraper';
const DEFAULT_MODE = 'Profile details no email ($4 per 1k)';

export function hasApifyConfig(runtime?: RuntimeEnv) {
  return Boolean(readEnv('APIFY_API_TOKEN', runtime));
}

function logoUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (typeof obj.url === 'string' && /^https?:\/\//i.test(obj.url)) return obj.url.trim();
    const sizes = Array.isArray(obj.sizes) ? obj.sizes : [];
    for (const size of sizes) {
      if (typeof size?.url === 'string' && /^https?:\/\//i.test(size.url)) return size.url.trim();
    }
  }
  return null;
}

function dateText(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'object' && typeof (value as any).text === 'string') {
    return (value as any).text.trim() || null;
  }
  return null;
}

function dateRange(start: unknown, end: unknown, fallback?: string | null) {
  const s = dateText(start);
  const e = dateText(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return s;
  if (e) return e;
  return fallback || null;
}

function yearFromDate(value: unknown): number | null {
  const text = dateText(value) || '';
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function skillName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const name = (value as any).name || (value as any).title || (value as any).skill;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

export function mapApifyLinkedInToDraft(raw: any, linkedinUrl: string): EnrichedProfileDraft {
  const experiences = (Array.isArray(raw?.experience) ? raw.experience : [])
    .map((exp: any, index: number) => {
      const title = String(exp?.position || exp?.title || '').trim() || null;
      const company = String(exp?.companyName || exp?.company || '').trim() || null;
      const range = dateRange(exp?.startDate, exp?.endDate, exp?.duration || null);
      const endText = dateText(exp?.endDate) || '';
      const isCurrent = /present/i.test(endText) || Boolean(exp?.isCurrent);
      const skills = Array.isArray(exp?.skills)
        ? exp.skills.map(skillName).filter(Boolean).slice(0, 12)
        : undefined;
      return {
        title,
        company,
        companyLogoUrl: logoUrl(exp?.companyLogo),
        companyLinkedInUrl: typeof exp?.companyLinkedinUrl === 'string' ? exp.companyLinkedinUrl : null,
        employmentType: typeof exp?.employmentType === 'string' ? exp.employmentType : null,
        location: typeof exp?.location === 'string' ? exp.location : null,
        dateRange: range,
        startDateLabel: dateText(exp?.startDate),
        endDateLabel: dateText(exp?.endDate),
        duration: typeof exp?.duration === 'string' ? exp.duration : null,
        description: typeof exp?.description === 'string' ? exp.description : null,
        skills: skills?.length ? (skills as string[]) : undefined,
        isCurrent,
        source: 'linkedin',
        sourceId: `linkedin:${[title, company, range, index].filter(Boolean).join(':').toLowerCase()}`,
      };
    })
    .filter((entry: any) => entry.title || entry.company)
    .slice(0, 12);

  const education = (Array.isArray(raw?.education) ? raw.education : [])
    .map((ed: any, index: number) => {
      const school = String(ed?.schoolName || ed?.school || '').trim() || null;
      const degree = String(ed?.degree || '').trim() || null;
      const field = String(ed?.fieldOfStudy || ed?.field || '').trim() || null;
      const range =
        (typeof ed?.period === 'string' && ed.period.trim()) ||
        dateRange(ed?.startDate, ed?.endDate);
      const graduationYear = yearFromDate(ed?.endDate);
      return {
        school,
        degree,
        field,
        dateRange: range || null,
        startDateLabel: dateText(ed?.startDate),
        endDateLabel: dateText(ed?.endDate),
        graduationYear,
        schoolLogoUrl: logoUrl(ed?.schoolLogo),
        schoolLinkedInUrl: typeof ed?.schoolLinkedinUrl === 'string' ? ed.schoolLinkedinUrl : null,
        source: 'linkedin',
        sourceId: `linkedin-edu:${[school, degree, range, index].filter(Boolean).join(':').toLowerCase()}`,
      };
    })
    .filter((entry: any) => entry.school || entry.degree || entry.field)
    .slice(0, 8);

  const skills = [
    ...(Array.isArray(raw?.skills) ? raw.skills : []),
    ...(Array.isArray(raw?.topSkills) ? (typeof raw.topSkills === 'string' ? [] : raw.topSkills) : []),
  ]
    .map(skillName)
    .filter(Boolean) as string[];

  const uniqueSkills = [...new Set(skills)].slice(0, 32);
  const location =
    raw?.location?.parsed?.text ||
    raw?.location?.linkedinText ||
    (typeof raw?.location === 'string' ? raw.location : null) ||
    null;

  const photo = logoUrl(raw?.photo) || logoUrl(raw?.profilePicture);
  const name = [raw?.firstName, raw?.lastName].filter(Boolean).join(' ').trim();
  const headline = typeof raw?.headline === 'string' ? raw.headline.trim().slice(0, 120) : null;
  const about = typeof raw?.about === 'string' ? raw.about.trim().slice(0, 2000) : null;

  return {
    headline,
    bio: about || (headline ? headline.slice(0, 500) : null),
    avatarUrl: photo,
    location: location ? String(location).slice(0, 120) : null,
    universityOrCompany: education[0]?.school || experiences[0]?.company || null,
    graduationYear: education.find((e) => e.graduationYear)?.graduationYear || null,
    education,
    experiences,
    skills: uniqueSkills.slice(0, 24),
    rolePreference: uniqueSkills.slice(0, 8),
    links: { linkedin: linkedinUrl },
    // Carry display name for founder apply via meta, not draft type — callers use raw.
  };
}

export type ApifyLinkedInScrapeResult = {
  raw: any;
  profile: EnrichedProfileDraft;
  linkedinUrl: string;
  vanityName: string | null;
  runId: string | null;
  datasetId: string | null;
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`Apify HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

export async function scrapeLinkedInProfileViaApify(
  linkedinUrl: string,
  runtime?: RuntimeEnv,
  options?: { waitSecs?: number }
): Promise<ApifyLinkedInScrapeResult> {
  const token = readEnv('APIFY_API_TOKEN', runtime);
  if (!token) throw new Error('APIFY_API_TOKEN is not configured');

  const waitSecs = options?.waitSecs ?? 120;
  const input = {
    profileScraperMode: DEFAULT_MODE,
    urls: [linkedinUrl],
  };

  const run = await requestJson(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?waitForFinish=${waitSecs}&token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  const data = run?.data || run;
  const status = String(data?.status || '');
  const datasetId = data?.defaultDatasetId || null;
  const runId = data?.id || null;

  if (!datasetId) {
    throw new Error(`Apify run returned no dataset (status=${status})`);
  }
  if (status && status !== 'SUCCEEDED') {
    throw new Error(`Apify LinkedIn scrape did not succeed (status=${status}, runId=${runId})`);
  }

  const items = await requestJson(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&format=json&clean=true`
  );
  const raw = Array.isArray(items) ? items[0] : null;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Apify LinkedIn scrape returned no profile rows');
  }

  const profile = mapApifyLinkedInToDraft(raw, linkedinUrl);
  return {
    raw,
    profile,
    linkedinUrl,
    vanityName: parseLinkedInVanityName(linkedinUrl) || raw?.publicIdentifier || null,
    runId,
    datasetId,
  };
}

/**
 * Re-host LinkedIn CDN images on Cloudinary with stable public_ids so company/school
 * logos are shared across builders. Fills missing logos via Bright Data when possible.
 */
export async function persistLinkedInMediaToCloudinary(
  draft: EnrichedProfileDraft,
  params: { linkedinUrl: string; runtime?: RuntimeEnv }
): Promise<EnrichedProfileDraft> {
  if (!hasCloudinaryConfig(params.runtime)) return draft;

  const next: EnrichedProfileDraft = {
    ...draft,
    experiences: draft.experiences ? [...draft.experiences] : undefined,
    education: draft.education ? [...draft.education] : undefined,
  };

  if (next.avatarUrl && !isCloudinaryUrl(next.avatarUrl)) {
    const permanent = await ensureLinkedInAvatar({
      vanityOrUrl: params.linkedinUrl,
      sourceUrl: next.avatarUrl,
      runtime: params.runtime,
    });
    if (permanent) next.avatarUrl = permanent;
  }

  if (next.experiences?.length) {
    const experiences = [];
    for (const exp of next.experiences) {
      const key = exp.companyLinkedInUrl || exp.company || '';
      let logo = exp.companyLogoUrl || null;

      if (logo && !isCloudinaryUrl(logo) && key) {
        const permanent = await ensureOrganizationLogo({
          type: 'company',
          nameOrUrl: key,
          sourceUrl: logo,
          runtime: params.runtime,
        });
        if (permanent) logo = permanent;
      }

      if ((!logo || !isCloudinaryUrl(logo)) && exp.companyLinkedInUrl) {
        const bright = await fetchBrightDataOrganizationLogo(exp.companyLinkedInUrl, params.runtime);
        if (bright) {
          const permanent = await ensureOrganizationLogo({
            type: 'company',
            nameOrUrl: exp.companyLinkedInUrl || exp.company || bright,
            sourceUrl: bright,
            runtime: params.runtime,
          });
          logo = permanent || bright;
        }
      }

      experiences.push({ ...exp, companyLogoUrl: logo });
    }
    next.experiences = experiences;
  }

  if (next.education?.length) {
    const education = [];
    for (const ed of next.education) {
      const key = ed.schoolLinkedInUrl || ed.school || '';
      let logo = ed.schoolLogoUrl || null;

      if (logo && !isCloudinaryUrl(logo) && key) {
        const permanent = await ensureOrganizationLogo({
          type: 'school',
          nameOrUrl: key,
          sourceUrl: logo,
          runtime: params.runtime,
        });
        if (permanent) logo = permanent;
      }

      if ((!logo || !isCloudinaryUrl(logo)) && ed.schoolLinkedInUrl) {
        const bright = await fetchBrightDataOrganizationLogo(ed.schoolLinkedInUrl, params.runtime);
        if (bright) {
          const permanent = await ensureOrganizationLogo({
            type: 'school',
            nameOrUrl: ed.schoolLinkedInUrl || ed.school || bright,
            sourceUrl: bright,
            runtime: params.runtime,
          });
          logo = permanent || bright;
        }
      }

      education.push({ ...ed, schoolLogoUrl: logo });
    }
    next.education = education;
  }

  return next;
}

export async function enrichLinkedInProfileViaApify(
  linkedinUrl: string,
  runtime?: RuntimeEnv
): Promise<ApifyLinkedInScrapeResult> {
  const scraped = await scrapeLinkedInProfileViaApify(linkedinUrl, runtime);
  const profile = await persistLinkedInMediaToCloudinary(scraped.profile, {
    linkedinUrl,
    runtime,
  });
  return { ...scraped, profile };
}
