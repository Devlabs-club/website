import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import { runRemoteLinkedInScraperScript } from '@/lib/remoteLinkedInScraper';
import { fetchUrlMarkdown, normalizeUrl } from './urlToMarkdown';
import { urlForMarkdownFetch } from './urlForMarkdown';
import {
  fetchLinkedInProfileViaVoyager,
  LinkedInSessionError,
  parseLinkedInVanityName,
} from './linkedinVoyager';
import type { EnrichedProfileDraft, SourceEnrichmentResult } from './types';

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeLinkedInUrl(input: string): string | null {
  let url = normalizeUrl(input);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('linkedin.com')) return null;
    parsed.hostname = 'www.linkedin.com';
    const vanity = parseLinkedInVanityName(url);
    if (vanity) parsed.pathname = `/in/${vanity}`;
    return parsed.toString();
  } catch {
    return url.replace(/\/+$/, '');
  }
}

function mapVoyagerToDraft(
  voyager: Awaited<ReturnType<typeof fetchLinkedInProfileViaVoyager>>,
  linkedinUrl: string
): EnrichedProfileDraft {
  const education = voyager.education
    .map((entry) => ({
      school: entry.school?.trim() || null,
      degree: entry.degree?.trim() || null,
      field: entry.field?.trim() || null,
      source: 'linkedin',
    }))
    .filter((entry) => entry.school || entry.degree || entry.field)
    .slice(0, 6);
  const university =
    education[0]?.school ||
    voyager.positions[0]?.company ||
    null;
  const experiences = voyager.positions
    .map((position, index) => ({
      title: position.title?.trim() || null,
      company: position.company?.trim() || null,
      companyLogoUrl: position.companyLogoUrl || null,
      companyLinkedInUrl: position.companyLinkedInUrl || null,
      employmentType: position.employmentType || null,
      location: position.location || null,
      dateRange: position.dateRange || null,
      startDateLabel: position.startDateLabel || null,
      endDateLabel: position.endDateLabel || null,
      duration: position.duration || null,
      description: position.description || null,
      isCurrent: Boolean(position.isCurrent),
      source: 'linkedin',
      sourceId: `linkedin:${[position.title, position.company, position.dateRange, index].filter(Boolean).join(':').toLowerCase()}`,
    }))
    .filter((position) => position.title || position.company)
    .slice(0, 6);

  const bio =
    voyager.summary ||
    [
      voyager.headline,
      voyager.positions[0]
        ? `${voyager.positions[0].title || 'Builder'} at ${voyager.positions[0].company || 'previous role'}`
        : null,
    ]
      .filter(Boolean)
      .join('. ')
      .slice(0, 500) ||
    null;

  return {
    headline: voyager.headline?.slice(0, 120) || null,
    bio: bio ? String(bio).slice(0, 2000) : null,
    location: voyager.location || null,
    universityOrCompany: university,
    education,
    experiences,
    rolePreference: voyager.skills.slice(0, 20),
    links: { linkedin: linkedinUrl },
  };
}

const LINKEDIN_EXTRACT_PROMPT = `Extract builder profile fields from LinkedIn profile text.
Return strict JSON:
{
  "headline": "string | null (max 120 chars)",
  "bio": "string | null (2-4 sentences about background and what they build, max 500 chars)",
  "universityOrCompany": "string | null",
  "graduationYear": "number | null",
  "experiences": [{"title": "string | null", "company": "string | null", "dateRange": "string | null", "description": "string | null", "isCurrent": "boolean"}],
  "education": [{"school": "string | null", "degree": "string | null", "field": "string | null"}],
  "skills": ["string"]
}
Use only facts present in the text.`;

async function refineWithLlm(rawText: string, draft: EnrichedProfileDraft): Promise<EnrichedProfileDraft> {
  if (!hasOpenRouterConfig()) return draft;

  const extraction = await generateOpenRouterReply({
    systemPrompt: LINKEDIN_EXTRACT_PROMPT,
    userPrompt: rawText,
    temperature: 0,
    maxTokens: 700,
  });

  const parsed = parseJsonResponse(extraction);
  if (!parsed) return draft;

  return {
    headline: typeof parsed.headline === 'string' ? parsed.headline : draft.headline,
    bio: typeof parsed.bio === 'string' ? parsed.bio : draft.bio,
    location: draft.location,
    universityOrCompany:
      typeof parsed.universityOrCompany === 'string'
        ? parsed.universityOrCompany
        : draft.universityOrCompany,
    graduationYear:
      typeof parsed.graduationYear === 'number' ? parsed.graduationYear : draft.graduationYear,
    experiences: Array.isArray(parsed.experiences) && parsed.experiences.length
      ? parsed.experiences
          .map((entry: any, index: number) => ({
            title: typeof entry?.title === 'string' ? entry.title : null,
            company: typeof entry?.company === 'string' ? entry.company : null,
            dateRange: typeof entry?.dateRange === 'string' ? entry.dateRange : null,
            description: typeof entry?.description === 'string' ? entry.description : null,
            isCurrent: Boolean(entry?.isCurrent),
            source: 'linkedin',
            sourceId: `linkedin:llm:${[
              typeof entry?.title === 'string' ? entry.title : '',
              typeof entry?.company === 'string' ? entry.company : '',
              typeof entry?.dateRange === 'string' ? entry.dateRange : '',
              index,
            ].join(':').toLowerCase()}`,
          }))
          .filter((entry) => entry.title || entry.company)
          .slice(0, 6)
      : draft.experiences,
    education: Array.isArray(parsed.education)
      ? parsed.education
          .map((entry: any) => ({
            school: typeof entry?.school === 'string' ? entry.school : null,
            degree: typeof entry?.degree === 'string' ? entry.degree : null,
            field: typeof entry?.field === 'string' ? entry.field : null,
            source: 'linkedin',
          }))
          .filter((entry) => entry.school || entry.degree || entry.field)
          .slice(0, 6)
      : draft.education,
    rolePreference: Array.isArray(parsed.skills)
      ? [...new Set([...(draft.rolePreference || []), ...parsed.skills.map(String)])]
      : draft.rolePreference,
    links: draft.links,
  };
}

function eachValues(value: any): string[] {
  if (Array.isArray(value?.$each)) return value.$each.map(String);
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [];
}

function profileDraftFromCdpArtifact(artifact: any, linkedinUrl: string): EnrichedProfileDraft {
  const proposed = artifact?.proposedMongoUpdate || {};
  const set = proposed.$set || {};
  const addToSet = proposed.$addToSet || {};
  const push = proposed.$push || {};
  const experiences = Array.isArray(push.experiences?.$each)
    ? push.experiences.$each
    : Array.isArray(artifact?.extracted?.experiences)
      ? artifact.extracted.experiences
      : undefined;
  const education = Array.isArray(artifact?.extracted?.education) ? artifact.extracted.education : undefined;

  return {
    headline: typeof set.headline === 'string' ? set.headline : null,
    bio: typeof set.bio === 'string' ? set.bio : null,
    location: typeof set.location === 'string' ? set.location : null,
    graduationYear: typeof set.graduationYear === 'number' ? set.graduationYear : null,
    rolePreference: eachValues(addToSet.rolePreference).slice(0, 20),
    experiences: Array.isArray(experiences) ? experiences.slice(0, 10) : undefined,
    education: Array.isArray(education) ? education.slice(0, 6) : undefined,
    links: { linkedin: linkedinUrl },
  };
}

async function enrichFromRemoteCdp(builder: any, normalizedUrl: string): Promise<SourceEnrichmentResult | null> {
  const args = builder?._id
    ? ['--builderId', String(builder._id), '--wait-ms', '12000']
    : [
        '--linkedin-url',
        normalizedUrl,
        '--name',
        String(builder?.name || builder?.email || 'Builder'),
        '--wait-ms',
        '12000',
      ];

  const result = await runRemoteLinkedInScraperScript('enrich-builder-linkedin-cdp.mjs', args);
  if (!result) return null;

  const artifact = result.artifact;
  const extracted = artifact?.extracted || {};
  return {
    source: 'linkedin',
    profile: profileDraftFromCdpArtifact(artifact, normalizedUrl),
    meta: {
      mode: 'remote_chrome_cdp',
      summary: result.summary,
      artifactPath: result.summary?.outputPath || null,
      profilePhotoUrl: extracted?.cdpExtraction?.photo?.imageUrl || null,
      extractedExperienceCount: Array.isArray(extracted.experiences) ? extracted.experiences.length : 0,
      extractedEducationCount: Array.isArray(extracted.education) ? extracted.education.length : 0,
      warnings: artifact?.warnings || extracted?.warnings || [],
    },
  };
}

export async function enrichFromLinkedIn(builder: any): Promise<SourceEnrichmentResult> {
  const linkedinUrl = builder?.links?.linkedin;
  if (!linkedinUrl) {
    return { source: 'linkedin', errors: ['no_linkedin_url'] };
  }

  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);
  if (!normalizedUrl) {
    return { source: 'linkedin', errors: ['invalid_linkedin_url'] };
  }

  try {
    const remote = await enrichFromRemoteCdp(builder, normalizedUrl);
    if (remote) return remote;
  } catch (err) {
    console.warn('[linkedin] remote CDP enrichment failed, falling back', err);
  }

  try {
    const voyager = await fetchLinkedInProfileViaVoyager(normalizedUrl);
    let profile = mapVoyagerToDraft(voyager, normalizedUrl);
    profile = await refineWithLlm(voyager.rawText, profile);

    return {
      source: 'linkedin',
      profile,
      meta: {
        mode: 'voyager_api',
        vanityName: voyager.vanityName,
        skillCount: voyager.skills.length,
        positionCount: voyager.positions.length,
        profilePhotoUrl: voyager.photoUrl,
      },
    };
  } catch (err) {
    if (err instanceof LinkedInSessionError && err.code === 'session_expired') {
      return {
        source: 'linkedin',
        errors: [err.code, err.message],
        meta: { mode: 'voyager_api' },
      };
    }

    const markdownUrl = urlForMarkdownFetch(normalizedUrl) || normalizedUrl;
    const chunk = await fetchUrlMarkdown(markdownUrl, 'LinkedIn profile', 7000);
    if (chunk && hasOpenRouterConfig()) {
      let profile: EnrichedProfileDraft = { links: { linkedin: normalizedUrl } };
      profile = await refineWithLlm(chunk.markdown, profile);
      return {
        source: 'linkedin',
        profile,
        meta: { mode: 'urltomarkdown', fetchUrl: markdownUrl },
      };
    }

    if (err instanceof LinkedInSessionError) {
      return {
        source: 'linkedin',
        errors: [err.code, err.message],
        meta: { mode: 'voyager_api' },
      };
    }
    return {
      source: 'linkedin',
      errors: [err instanceof Error ? err.message : 'linkedin_enrichment_failed'],
    };
  }
}
