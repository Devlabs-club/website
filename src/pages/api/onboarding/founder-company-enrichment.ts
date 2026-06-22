import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import {
  requireRemoteLinkedInScraperConfig,
  runRequiredRemoteLinkedInScraperScript,
} from '@/lib/remoteLinkedInScraper';
import FounderProfile from '@/models/talent/FounderProfile';
import CompanyProfile from '@/models/founder/CompanyProfile';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compactKey(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function slugFromCompanyUrl(url: unknown): string | null {
  const match = String(url || '').match(/\/company\/([^/?#]+)/i);
  return match ? match[1] : null;
}

async function resolveUser(request: Request, locals: App.Locals) {
  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return { user: null, runtime };
  const decoded = verifyToken(token, runtime);
  if (!decoded) return { user: null, runtime };
  return { user: await findUserById(decoded.userId, runtime), runtime };
}

async function runCompanyScript(args: string[], runtime?: Record<string, string | undefined>) {
  return runRequiredRemoteLinkedInScraperScript('enrich-founder-company-linkedin-cdp.mjs', args, runtime);
}

/**
 * Enrich a chosen company by opening its LinkedIn About page in the logged-in Chrome
 * (CDP) session — `/company/<username>/about/?viewAsMember=true` — and reading the
 * website + about. No web-search API involved.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const { user, runtime } = await resolveUser(request, locals);
  if (!user) return json({ success: false, error: 'Please log in to continue.' }, 401);

  try {
    await connectAdminDB();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const founderProfile = await FounderProfile.findOne({ userId: String(user._id) }).lean();
    const experiences = ((founderProfile as any)?.metadata?.experiences || []) as any[];

    const requestedIndex = Number(body.experienceIndex);
    const fromIndex =
      Number.isInteger(requestedIndex) && experiences[requestedIndex] ? experiences[requestedIndex] : null;
    const fallback = experiences.find((e) => e?.isCurrent) || experiences[0] || null;
    const chosen = fromIndex || fallback;

    const companyUsername =
      cleanString(body.companyUsername) ||
      slugFromCompanyUrl(body.companyLinkedInUrl) ||
      cleanString(chosen?.companyUsername) ||
      slugFromCompanyUrl(chosen?.companyLinkedInUrl);

    const companyName =
      cleanString(body.company) || cleanString(chosen?.company) || cleanString((founderProfile as any)?.company);

    if (!companyUsername) {
      return json(
        {
          success: false,
          error:
            "We couldn't find this company's LinkedIn page from your profile. Add the company manually to continue.",
        },
        422
      );
    }

    const cdpUrl = 'http://127.0.0.1:9222';
    const remoteScraper = requireRemoteLinkedInScraperConfig(runtime);
    const cdp = { started: false, remote: true, url: remoteScraper.url };

    const scriptArgs = [
      '--company-username',
      companyUsername,
      '--output-key',
      `founder-company-${String(user._id)}-${compactKey(companyUsername)}`,
      '--cdp-url',
      cdpUrl,
      '--wait-ms',
      '9000',
    ];
    if (companyName) scriptArgs.push('--company-name', companyName);

    const { summary, artifact } = await runCompanyScript(scriptArgs, runtime);
    const company = artifact?.company || {};
    const name = cleanString(company.name) || companyName || 'My company';

    await CompanyProfile.findOneAndUpdate(
      { founderId: String(user._id) },
      {
        $set: {
          founderId: String(user._id),
          founderEmail: user.email,
          name,
          website: cleanString(company.website),
          location: cleanString(company.location) || cleanString(company.headquarters),
          description: cleanString(company.about) || cleanString(company.description),
          industry: cleanString(company.industry),
          metadata: {
            logoUrl: cleanString(company.logoUrl) || cleanString(chosen?.companyLogoUrl),
            linkedInUrl: cleanString(company.linkedInUrl),
            companyUsername,
            companySize: cleanString(company.companySize),
            headquarters: cleanString(company.headquarters),
            founded: cleanString(company.founded),
            specialties: cleanString(company.specialties),
            warnings: artifact?.warnings || [],
            artifactPath: summary?.outputPath || null,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await FounderProfile.findOneAndUpdate(
      { userId: String(user._id) },
      {
        $set: {
          company: name,
          companyWebsite: cleanString(company.website),
          startupSummary: cleanString(company.about) || cleanString(company.description),
          industry: cleanString(company.industry),
          enrichmentStatus: artifact?.warnings?.length ? 'partial' : 'complete',
          enrichedAt: new Date(),
        },
        $addToSet: { enrichmentSources: 'company_linkedin_about' },
      },
      { new: true }
    );

    await updateUserAccount(String(user._id), { onboardingStatus: 'company' }, runtime);

    return json({
      success: true,
      cdp,
      company: {
        name,
        website: cleanString(company.website),
        location: cleanString(company.location) || cleanString(company.headquarters),
        description: cleanString(company.about) || cleanString(company.description),
        logoUrl: cleanString(company.logoUrl) || cleanString(chosen?.companyLogoUrl),
      },
      warnings: artifact?.warnings || [],
    });
  } catch (error) {
    console.error('[founder-company-enrichment] failed', error);
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Company enrichment failed.' },
      500
    );
  }
};
