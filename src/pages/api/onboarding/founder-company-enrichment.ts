import { deepResearchCompany } from '@/lib/talent/founderCompanyDeepResearch';
import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import FounderProfile from '@/models/talent/FounderProfile';
import CompanyProfile from '@/models/founder/CompanyProfile';

export const prerender = false;

/** Stay under Vercel maxDuration with headroom for deep research + DB writes. */
const REQUEST_BUDGET_MS = 90_000;
const DEEP_RESEARCH_BUDGET_MS = 35_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function slugFromCompanyUrl(url: unknown): string | null {
  const match = String(url || '').match(/\/company\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function remainingMs(startedAt: number, budgetMs = REQUEST_BUDGET_MS) {
  return Math.max(0, budgetMs - (Date.now() - startedAt));
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

/**
 * Prefill company details for founder onboarding step 2.
 *
 * Direct LinkedIn CDP `/run` is disabled on the Railway scraper (global FIFO
 * queue only). For this interactive step we seed from the selected experience
 * and optionally deep-research the company — no Chrome scrape required.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const startedAt = Date.now();
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

    if (!companyName && !companyUsername) {
      return json(
        {
          success: false,
          error:
            "We couldn't identify this company from your profile. Add the company manually to continue.",
        },
        422
      );
    }

    const linkedInUrl =
      cleanString(body.companyLinkedInUrl) ||
      cleanString(chosen?.companyLinkedInUrl) ||
      (companyUsername ? `https://www.linkedin.com/company/${companyUsername}` : null);

    const logoUrl =
      cleanString(body.companyLogoUrl) || cleanString(chosen?.companyLogoUrl) || null;

    let name = companyName || companyUsername || 'My company';
    let website: string | null = null;
    let location =
      cleanString(body.location) ||
      cleanString(chosen?.location) ||
      null;
    let description = '';
    let industry: string | null = null;
    let researchHighlights: string[] = [];
    let researchSkipped: string | null = null;

    const researchBudget = Math.min(DEEP_RESEARCH_BUDGET_MS, remainingMs(startedAt) - 5_000);
    if (researchBudget >= 8_000) {
      try {
        const research = await deepResearchCompany({
          name,
          website,
          linkedInUrl,
          runtime,
          timeoutMs: researchBudget,
        });
        if (research.description) {
          description = research.description;
          if (
            research.whatTheyBuild &&
            !description.toLowerCase().includes(research.whatTheyBuild.toLowerCase().slice(0, 20))
          ) {
            description = `${description} ${research.whatTheyBuild}`.trim();
          }
        }
        if (research.website) website = research.website;
        researchHighlights = research.highlights;
        console.info('[founder-company-enrichment] deep research', {
          providers: research.searchProviders,
          highlights: researchHighlights.length,
          citations: research.citations.length,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (researchErr) {
        researchSkipped = researchErr instanceof Error ? researchErr.message : 'deep_research_failed';
        console.warn('[founder-company-enrichment] deep research skipped', researchErr);
      }
    } else {
      researchSkipped = 'skipped_low_time_budget';
    }

    const persist = body.persist !== false && body.draft !== true;

    if (persist) {
      await CompanyProfile.findOneAndUpdate(
        { founderId: String(user._id) },
        {
          $set: {
            founderId: String(user._id),
            founderEmail: user.email,
            name,
            website,
            location,
            description,
            industry,
            metadata: {
              logoUrl,
              linkedInUrl,
              companyUsername,
              researchHighlights,
              researchSkipped,
              source: 'experience_plus_research',
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
            companyWebsite: website,
            startupSummary: description || null,
            industry,
            enrichedAt: new Date(),
          },
          $addToSet: {
            enrichmentSources: {
              $each: researchSkipped
                ? ['company_experience']
                : ['company_experience', 'company_deep_research'],
            },
          },
        },
        { new: true }
      );

      await updateUserAccount(String(user._id), { onboardingStatus: 'company' }, runtime);
    }

    return json({
      success: true,
      draft: !persist,
      company: {
        name,
        website: website || '',
        location: location || '',
        description,
        logoUrl,
      },
      warnings: researchSkipped ? [researchSkipped] : [],
      meta: {
        elapsedMs: Date.now() - startedAt,
        researchSkipped,
        source: 'experience_plus_research',
      },
    });
  } catch (error) {
    console.error('[founder-company-enrichment] failed', error);
    const message = error instanceof Error ? error.message : 'Company enrichment failed.';
    const timedOut = /aborted|timed out|timeout/i.test(message);
    return json(
      {
        success: false,
        error: timedOut
          ? 'Company enrichment took too long. Try again, or add the company manually.'
          : message,
      },
      timedOut ? 504 : 500
    );
  }
};
