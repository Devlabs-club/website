import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { updateUserAccount } from '@/lib/adminMongo';
import { linkedInProfilesMatch } from '@/lib/linkedinUrl';
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
    batchId?: string;
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
    const existing = await FounderProfile.findOne({ userId: payload.builderId }).lean();
    const expectedBatchId =
      typeof (existing as any)?.metadata?.enrichmentBatchId === 'string'
        ? (existing as any).metadata.enrichmentBatchId
        : null;
    const expectedLinkedIn =
      (existing as any)?.linkedin ||
      (existing as any)?.metadata?.enrichmentLinkedInUrl ||
      null;

    // Back/discard clears linkedin + batchId. Any late callback for an old URL
    // must not resurrect that scrape into the founder profile.
    if (!expectedLinkedIn || !linkedInProfilesMatch(expectedLinkedIn, payload.linkedInUrl)) {
      console.warn('[linkedin-enrichment-complete] ignoring stale founder callback (linkedin mismatch)', {
        userId: payload.builderId,
        expectedLinkedIn,
        payloadLinkedIn: payload.linkedInUrl,
        batchId: payload.batchId || null,
      });
      return json({
        ok: true,
        ignored: true,
        reason: 'linkedin_mismatch',
      });
    }
    if (!expectedBatchId || !payload.batchId || expectedBatchId !== payload.batchId) {
      console.warn('[linkedin-enrichment-complete] ignoring stale founder callback (batch mismatch)', {
        userId: payload.builderId,
        expectedBatchId,
        payloadBatchId: payload.batchId || null,
        linkedInUrl: payload.linkedInUrl,
      });
      return json({
        ok: true,
        ignored: true,
        reason: 'batch_mismatch',
      });
    }

    const extracted = payload.artifact.extracted || {};
    const clean = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    const experiences = (Array.isArray(extracted.experiences) ? extracted.experiences : [])
      .map((experience: any) => ({
        title: clean(experience?.title),
        company: clean(experience?.company),
        companyUsername: clean(experience?.companyUsername),
        companyLinkedInUrl: clean(experience?.companyLinkedInUrl),
        companyLogoUrl: clean(experience?.companyLogoUrl),
        employmentType: clean(experience?.employmentType),
        location: clean(experience?.location),
        dateRange: clean(experience?.dateRange),
        isCurrent: Boolean(experience?.isCurrent),
      }))
      .filter((experience: any) => experience.company)
      .sort((a: any, b: any) => Number(b.isCurrent) - Number(a.isCurrent))
      .slice(0, 12);
    const current = experiences.find((experience: any) => experience.isCurrent) || experiences[0] || null;
    const companyName = current?.company || 'My company';
    const title = current?.title || clean(extracted.headline);
    const photoUrl = clean(extracted?.cdpExtraction?.photo?.imageUrl);
    const enrichmentStatus = extracted?.warnings?.length ? 'partial' : 'complete';
    const prevMeta = ((existing as any)?.metadata || {}) as Record<string, unknown>;
    const founder = await FounderProfile.findOneAndUpdate(
      { userId: payload.builderId },
      {
        $set: {
          userId: payload.builderId,
          founderEmail: payload.email || (existing as any)?.founderEmail || null,
          founderName: payload.name || (existing as any)?.founderName || null,
          linkedin: payload.linkedInUrl,
          company: companyName,
          founderBio: clean(extracted.about) || clean(extracted.headline),
          logoUrl: photoUrl,
          enrichmentStatus,
          enrichmentSources: ['linkedin'],
          enrichedAt: new Date(),
          metadata: {
            onboardingDraft: true,
            enrichmentEpoch: prevMeta.enrichmentEpoch ?? null,
            enrichmentBatchId: payload.batchId || expectedBatchId || null,
            enrichmentLinkedInUrl: payload.linkedInUrl,
            title,
            currentCompanyName: companyName,
            currentCompanyLinkedInUrl: current?.companyLinkedInUrl || null,
            currentCompanyLogoUrl: current?.companyLogoUrl || null,
            experiences,
          },
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
    return json({ ok: true, founderId: String(founder?._id || ''), enrichmentStatus });
  }

  const builder = await BuilderProfile.findById(payload.builderId);
  if (!builder) return json({ error: 'builder_not_found' }, 404);
  return json({ ok: true, result: await applyLinkedInCdpToBuilder(builder, payload.artifact, payload.linkedInUrl) });
};
