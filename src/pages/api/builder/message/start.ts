import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import { normalizeClaimPhone, startClaimConversation } from '@/lib/builderClaim';

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const authToken =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  const decoded = authToken ? verifyToken(authToken, runtime) : null;
  if (!decoded) return json({ ok: false, error: 'not_authenticated' }, 401);

  await connectAdminDB();
  const user = await findUserById(decoded.userId, runtime);
  if (!user) return json({ ok: false, error: 'not_authenticated' }, 401);

  const userEmail = String(user.email || '').toLowerCase().trim();
  const profile = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: userEmail }],
  });
  const phone = normalizeClaimPhone(String(profile?.phone || user.phone || ''));
  const claimOr: Record<string, unknown>[] = [{ builderEmail: userEmail }];
  if (profile?._id) claimOr.push({ builderId: profile._id });
  if (phone) claimOr.push({ phone });

  const claim = await BuilderProfileClaim.findOne({
    status: { $in: ['phone_verified', 'conversation_started', 'completed'] },
    $or: claimOr,
  }).sort({ updatedAt: -1 });

  if (!claim || !claim.phoneVerifiedAt || !claim.phone) {
    return json({ ok: false, error: 'phone_not_verified' }, 400);
  }

  const result = await startClaimConversation(claim, runtime);
  return json({ ok: true, delivery: result.delivery });
};
