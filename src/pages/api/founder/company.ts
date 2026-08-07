import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import { updateUserAccount } from '@/lib/adminMongo';
import CompanyProfile from '@/models/founder/CompanyProfile';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Save reviewed company details (Step 2 of onboarding). */
export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = str(body.name);
  if (!name) return errorJson('Enter your company name to continue.', 400);

  const websiteRaw = str(body.website);
  if (!websiteRaw) return errorJson('Enter your company website (e.g. www.yourcompany.com).', 400);
  let website: string;
  try {
    website = new URL(/^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`).toString();
  } catch {
    return errorJson('Enter a valid company website (e.g. www.yourcompany.com).', 400);
  }

  if (!str(body.location)) return errorJson('Enter your company location to continue.', 400);
  if (!str(body.description)) return errorJson('Add a short about section for your company.', 400);

  await connectAdminDB();

  await CompanyProfile.findOneAndUpdate(
    { founderId: identity.founderId },
    {
      $set: {
        founderId: identity.founderId,
        founderEmail: identity.email,
        name,
        website,
        location: str(body.location),
        description: str(body.description),
        ...(str(body.logoUrl) ? { metadata: { logoUrl: str(body.logoUrl) } } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await updateUserAccount(identity.founderId, { onboardingStatus: 'context' });

  // The intro now renders as an overlay on the home screen instead of a separate page.
  return okJson({ next: '/founder/home' });
};

export const prerender = false;
