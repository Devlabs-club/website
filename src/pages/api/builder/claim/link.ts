import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { verifyClaimToken } from '@/lib/messaging/claimToken';
import { normalizeClaimEmail } from '@/lib/builderClaim';
import { notifyOps, opsPersonFrom } from '@/lib/opsTelegram';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readInviteCookie(cookieHeader: string): { email?: string; token?: string } | null {
  const match = /(?:^|;\s*)devlabs_invite=([^;]+)/.exec(cookieHeader || '');
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/**
 * POST — reconcile an email-invited builder with their newly logged-in account.
 *
 * Reads the `devlabs_invite` cookie (or a `token` in the body), verifies the
 * signed invite token, links the pre-built BuilderProfile + claim to this user,
 * and marks the account as a builder in onboarding. Idempotent. Does NOT clear
 * any cookies — the invite identity and login cookies are left in place.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  const authToken =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!authToken) return json({ success: false, error: 'unauthenticated' }, 401);

  const decoded = verifyToken(authToken, runtime);
  if (!decoded) return json({ success: false, error: 'unauthenticated' }, 401);

  const user = await findUserById(decoded.userId, runtime);
  if (!user) return json({ success: false, error: 'unauthenticated' }, 401);

  const userEmail = normalizeClaimEmail(String(user.email || ''));
  if (!userEmail) return json({ success: false, error: 'missing_account_email' }, 400);

  // Resolve the invite token from body or the persisted cookie.
  let bodyToken = '';
  try {
    const body = await request.json();
    if (body && typeof body.token === 'string') bodyToken = body.token;
  } catch {
    /* no body / not JSON — fall back to cookie */
  }
  const cookie = readInviteCookie(request.headers.get('Cookie') || '');
  const inviteToken = bodyToken || cookie?.token || '';

  let invitedEmail = '';
  if (inviteToken) {
    const payload = verifyClaimToken(inviteToken, runtime);
    if (payload?.email) invitedEmail = normalizeClaimEmail(payload.email);
  } else if (cookie?.email) {
    invitedEmail = normalizeClaimEmail(cookie.email);
  }

  const matched = Boolean(invitedEmail) && invitedEmail === userEmail;

  await connectAdminDB();

  // Link the pre-built builder profile (keyed by email) to this user.
  const profile = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: userEmail }],
  });
  if (profile && !profile.userId) {
    profile.userId = user._id;
    if (!profile.email) profile.email = userEmail;
    await profile.save();
  }

  // Advance the claim tracking row for this email, if any.
  const claim = await BuilderProfileClaim.findOne({
    builderEmail: userEmail,
    status: { $nin: ['expired'] },
  }).sort({ updatedAt: -1 });

  let firstClaim = false;
  if (claim) {
    firstClaim = !claim.metadata?.opsClaimNotifiedAt;
    if (claim.status === 'email_sent' || claim.status === 'phone_pending') {
      claim.status = 'conversation_started';
    }
    if (!claim.builderId && profile?._id) claim.builderId = profile._id;
    claim.metadata = {
      ...(claim.metadata || {}),
      userId: String(user._id),
      webOnboarding: true,
      webOnboardingStartedAt: new Date().toISOString(),
      tokenMatched: matched,
      ...(firstClaim ? { opsClaimNotifiedAt: new Date().toISOString() } : {}),
    };
    await claim.save();
  }

  // Mark the account as a builder in onboarding (don't downgrade a completed one).
  const nextOnboarding = user.onboardingStatus === 'complete' ? undefined : 'profile';
  await updateUserAccount(
    String(user._id),
    { accountType: 'builder', onboardingStatus: nextOnboarding },
    runtime
  ).catch((error) => console.error('[builder/claim/link] user update failed', error));

  if (firstClaim || (!claim && matched)) {
    notifyOps({
      event: 'link_claimed',
      title: `New builder signed up ${opsPersonFrom(user.name || profile?.name, userEmail)}`,
    });
  }

  return json({
    success: true,
    linked: true,
    matched,
    builderId: profile?._id ? String(profile._id) : null,
  });
};

export const prerender = false;
