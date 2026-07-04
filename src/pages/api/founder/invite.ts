import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import JobPosting from '@/models/founder/JobPosting';
import BuilderProfile from '@/models/talent/BuilderProfile';
import FounderProfile from '@/models/talent/FounderProfile';
import IntroRequest from '@/models/talent/IntroRequest';
import { notifyBuilderIntroReceived } from '@/lib/talent/introFlow';
import { seedThreadFromIntro } from '@/lib/talent/messageFlow';
import { canUseLifecycle, entitlementErrorResponse, getFounderEntitlements, recordUsageEvent } from '@/lib/billing/entitlements';

/** Founder invites a recommended builder to a role (creates an intro request). */
export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);
  const { entitlements } = await getFounderEntitlements(identity);
  const denied = canUseLifecycle(entitlements);
  if (denied) {
    const blocked = denied as any;
    return new Response(JSON.stringify({ success: false, ...entitlementErrorResponse(blocked) }), {
      status: blocked.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await connectAdminDB();
  const founderProfile = await FounderProfile.findOne({ founderEmail: identity.email })
    .select('schedulingLink')
    .lean();
  if (!(founderProfile as any)?.schedulingLink) {
    return new Response(
      JSON.stringify({
        success: false,
        code: 'SCHEDULING_LINK_REQUIRED',
        error: 'Add your Cal.com or Calendly link before inviting builders.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const jobId = String(body.jobId || '');
  const builderId = String(body.builderId || '');
  if (!mongoose.Types.ObjectId.isValid(jobId) || !mongoose.Types.ObjectId.isValid(builderId)) {
    return errorJson('Valid jobId and builderId are required.', 400);
  }

  const [job, builder] = await Promise.all([
    JobPosting.findOne({ _id: jobId, founderEmail: identity.email }).lean(),
    BuilderProfile.findById(builderId).select('name email').lean(),
  ]);
  if (!job) return errorJson('Role not found.', 404);
  if (!builder) return errorJson('Builder not found.', 404);

  const roleTitle = (job as any).title || (job as any).roleTitle || 'a role';
  const company = (job as any).company || identity.founderName;
  const introMessage =
    (typeof body.message === 'string' && body.message.trim()) ||
    `${identity.founderName} would like to talk to you about ${roleTitle} at ${company}.`;

  const intro = await IntroRequest.findOneAndUpdate(
    { opportunityId: jobId, builderId },
    {
      $setOnInsert: {
        opportunityId: jobId,
        builderId,
        founderEmail: identity.email,
        founderName: identity.founderName,
        introMessage,
        status: 'requested',
      },
    },
    { upsert: true, new: true }
  );

  if ((builder as any).email) {
    await notifyBuilderIntroReceived({
      builderId,
      builderEmail: (builder as any).email,
      founderName: identity.founderName,
      founderEmail: identity.email,
      roleTitle,
      company,
      introRequestId: String(intro._id),
      opportunityId: jobId,
    }).catch((err) => console.error('[founder/invite] notify failed', err));
  }

  await seedThreadFromIntro(intro);

  await recordUsageEvent({
    identity,
    eventType: 'intro_requested',
    opportunityId: jobId,
    builderId,
    planAtEvent: entitlements.plan,
    metadata: { source: 'founder_invite_api' },
  });

  return okJson({ introId: String(intro._id), status: intro.status });
};

export const prerender = false;
