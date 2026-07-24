import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { updateUserAccount } from '@/lib/adminMongo';
import { readEnv, runtimeEnvFromLocals } from '@/lib/workosEnv';
import { applyLinkedInCdpToBuilder } from '@/lib/talent/builderEnrichment/apply';
import BuilderProfile from '@/models/talent/BuilderProfile';
import FounderProfile from '@/models/talent/FounderProfile';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Railway calls this only after a queued job has completed. The scraper and
 * website share a dedicated callback secret; browser session credentials never
 * leave Railway and MongoDB credentials never leave the website.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const expectedSecret = readEnv('LINKEDIN_ENRICHMENT_CALLBACK_SECRET', runtime);
  const suppliedSecret = request.headers.get('x-linkedin-enrichment-secret');
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: 'unauthorized' }, 401);
  }

  const payload = await request.json().catch(() => null) as {
    event?: string;
    builderId?: string;
    callbackType?: 'builder' | 'founder';
    email?: string | null;
    name?: string | null;
    linkedInUrl?: string;
    artifact?: any;
  } | null;
  if (
    payload?.event !== 'linkedin_enrichment.completed' ||
    !payload.builderId ||
    !payload.linkedInUrl ||
    !payload.artifact
  ) {
    return json({ error: 'invalid_payload' }, 400);
  }

  await connectAdminDB();
  if (payload.callbackType === 'founder') {
    const extracted = payload.artifact.extracted || {};
    const experiences = (Array.isArray(extracted.experiences) ? extracted.experiences : [])
      .map((experience: any) => ({
        title: typeof experience?.title === 'string' ? experience.title : null,
        company: typeof experience?.company === 'string' ? experience.company : null,
        companyLinkedInUrl: typeof experience?.companyLinkedInUrl === 'string' ? experience.companyLinkedInUrl : null,
        companyLogoUrl: typeof experience?.companyLogoUrl === 'string' ? experience.companyLogoUrl : null,
        isCurrent: Boolean(experience?.isCurrent),
      }))
      .filter((experience: any) => experience.company)
      .slice(0, 12);
    const current = experiences.find((experience: any) => experience.isCurrent) || experiences[0] || null;
    const founder = await FounderProfile.findOneAndUpdate(
      { userId: payload.builderId },
      {
        $set: {
          userId: payload.builderId,
          founderEmail: payload.email || null,
          founderName: payload.name || null,
          linkedin: payload.linkedInUrl,
          company: current?.company || 'My company',
          founderBio: extracted.about || extracted.headline || null,
          logoUrl: extracted?.cdpExtraction?.photo?.imageUrl || null,
          enrichmentStatus: extracted?.warnings?.length ? 'partial' : 'complete',
          enrichmentSources: ['linkedin'],
          enrichedAt: new Date(),
          metadata: { experiences, title: current?.title || null },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await updateUserAccount(payload.builderId, {
      role: 'founder',
      accountType: 'founder',
      onboardingStatus: 'profile',
      ...(founder?.logoUrl ? { avatarUrl: founder.logoUrl } : {}),
    }, runtime);
    return json({ ok: true, founderId: String(founder?._id || '') });
  }

  const builder = await BuilderProfile.findById(payload.builderId);
  if (!builder) return json({ error: 'builder_not_found' }, 404);
  return json({ ok: true, result: await applyLinkedInCdpToBuilder(builder, payload.artifact, payload.linkedInUrl) });
};
