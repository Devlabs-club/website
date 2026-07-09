import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import { buildClaimHandoffResponse } from '@/lib/builderImessageHandoff';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** GET — signed iMessage handoff for logged-in builder (website signup flow). */
export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const authToken =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  const decoded = authToken ? verifyToken(authToken, runtime) : null;
  if (!decoded) return json({ success: false, error: 'not_authenticated' }, 401);

  await connectAdminDB();
  const user = await findUserById(decoded.userId, runtime);
  if (!user) return json({ success: false, error: 'not_authenticated' }, 401);

  const userEmail = String(user.email || '').toLowerCase().trim();
  if (!userEmail) return json({ success: false, error: 'missing_email' }, 400);

  const profile = (await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: userEmail }],
  }).lean()) as any;

  const claim = (await BuilderProfileClaim.findOne({
    builderEmail: userEmail,
    status: { $ne: 'expired' },
  })
    .sort({ updatedAt: -1 })
    .lean()) as any;

  const body = await buildClaimHandoffResponse({
    email: userEmail,
    name: user.name || profile?.name || undefined,
    builderId: profile?._id ? String(profile._id) : undefined,
    phoneVerified: Boolean(profile?.phoneVerifiedAt || claim?.phoneVerifiedAt),
    runtime,
  });

  return json({
    ...body,
    builderName: profile?.name || user.name || body.builderName,
  });
};

export const prerender = false;
