import type { APIRoute } from 'astro';
import mongoose from 'mongoose';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import JobPosting from '@/models/founder/JobPosting';
import BuilderProfile from '@/models/talent/BuilderProfile';
import IntroRequest from '@/models/talent/IntroRequest';
import { notifyBuilderIntroReceived } from '@/lib/talent/introFlow';

/** Founder invites a recommended builder to a role (creates an intro request). */
export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const jobId = String(body.jobId || '');
  const builderId = String(body.builderId || '');
  if (!mongoose.Types.ObjectId.isValid(jobId) || !mongoose.Types.ObjectId.isValid(builderId)) {
    return errorJson('Valid jobId and builderId are required.', 400);
  }

  await connectAdminDB();

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
      roleTitle,
      company,
      introRequestId: String(intro._id),
    }).catch((err) => console.error('[founder/invite] notify failed', err));
  }

  return okJson({ introId: String(intro._id), status: intro.status });
};

export const prerender = false;
