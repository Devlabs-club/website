import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
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
  const university =
    voyager.education[0]?.school ||
    voyager.positions[0]?.company ||
    null;

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
    universityOrCompany: university,
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
    universityOrCompany:
      typeof parsed.universityOrCompany === 'string'
        ? parsed.universityOrCompany
        : draft.universityOrCompany,
    graduationYear:
      typeof parsed.graduationYear === 'number' ? parsed.graduationYear : draft.graduationYear,
    rolePreference: Array.isArray(parsed.skills)
      ? [...new Set([...(draft.rolePreference || []), ...parsed.skills.map(String)])]
      : draft.rolePreference,
    links: draft.links,
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
