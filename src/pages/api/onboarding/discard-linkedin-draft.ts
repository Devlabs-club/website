import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import FounderProfile from '@/models/talent/FounderProfile';
import CompanyProfile from '@/models/founder/CompanyProfile';

export const prerender = false;

/**
 * Wipe LinkedIn onboarding draft data when the founder hits Back before finishing
 * steps 1–2. Enrichment may land in Mongo temporarily so the async Railway
 * callback has somewhere to write, but Back must clear it so a mistaken URL
 * cannot resurface.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  await connectAdminDB();

  const existing = await FounderProfile.findOne({ userId: identity.founderId }).lean();
  const prevEpoch =
    typeof (existing as any)?.metadata?.enrichmentEpoch === 'number'
      ? (existing as any).metadata.enrichmentEpoch
      : 0;

  await FounderProfile.findOneAndUpdate(
    { userId: identity.founderId },
    {
      $set: {
        userId: identity.founderId,
        founderEmail: identity.email,
        founderName: identity.founderName,
        linkedin: null,
        company: 'My company',
        founderBio: null,
        logoUrl: null,
        companyWebsite: null,
        startupSummary: null,
        industry: null,
        enrichmentStatus: 'failed',
        enrichedAt: null,
        enrichmentSources: [],
        metadata: {
          onboardingDraft: true,
          enrichmentEpoch: prevEpoch + 1,
          enrichmentBatchId: null,
          enrichmentLinkedInUrl: null,
          enrichmentDiscardedAt: new Date().toISOString(),
          title: null,
          experiences: [],
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Company enrichment may have written a draft during step 2 — remove it too if
  // the founder abandoned before confirming both steps.
  await CompanyProfile.deleteMany({ founderId: identity.founderId });

  return okJson({ discarded: true });
};
