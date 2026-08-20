import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { findClaimByViewToken } from '@/lib/builderClaim';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { serializeBuilderProfile } from '@/lib/talent/serializeBuilderProfile';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Resolve a builder's PRIVATE profile-view token (sent only over their verified
 * iMessage) into the same profile shape founders see. Token-gated — only that
 * builder can open their own page.
 */
export const GET: APIRoute = async ({ params }) => {
  const token = String(params.token || '');
  if (!token) return json({ success: false, error: 'Missing token.' }, 400);

  await connectAdminDB();
  const claim = await findClaimByViewToken(token);
  if (!claim || !claim.builderId) return json({ success: false, error: 'Profile not found.' }, 404);

  const profile = (await BuilderProfile.findById(claim.builderId).lean()) as any;
  if (!profile) return json({ success: false, error: 'Profile not found.' }, 404);

  const projects = await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean();

  return json({
    success: true,
    profile: await serializeBuilderProfile(profile, projects),
  });
};

export const prerender = false;
