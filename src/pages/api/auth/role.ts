import type { APIRoute } from 'astro';
import { updateUserAccount } from '../../../lib/adminMongo';
import { generateToken, verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';
import { buildAuthTokenCookie } from '../../../lib/authCookie.ts';
import { notifyOps, opsPersonFrom } from '../../../lib/opsTelegram';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Persist the account type chosen on /auth/select-role. */
export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    let token = extractTokenFromHeader(request.headers.get('Authorization'));
    if (!token) token = extractTokenFromCookies(request.headers.get('Cookie') || '');
    if (!token) return json({ success: false, message: 'Not authenticated' }, 401);

    const decoded = verifyToken(token, runtime);
    if (!decoded) return json({ success: false, message: 'Invalid token' }, 401);

    const body = (await request.json().catch(() => ({}))) as { accountType?: string };
    const accountType = body.accountType;
    if (accountType !== 'founder' && accountType !== 'builder') {
      return json({ success: false, message: 'accountType must be "founder" or "builder"' }, 400);
    }

    const updated = await updateUserAccount(
      decoded.userId,
      {
        accountType,
        role: accountType, // mirror into role for role-based routing
        onboardingStatus: accountType === 'builder' ? 'imessage_claim' : 'linkedin',
      },
      runtime
    );

    if (!updated) return json({ success: false, message: 'User not found' }, 404);

    notifyOps({
      event: 'role_selected',
      title: `New ${accountType} signed up ${opsPersonFrom(updated.name, updated.email)}`,
    });

    // Re-issue the session cookie so middleware role checks see founder/builder immediately.
    const freshToken = generateToken(updated, runtime);

    // Honor deep-link redirects (e.g. claim URLs / founder paths) after role is set.
    const requestUrl = new URL(request.url);
    const referer = request.headers.get('referer') || '';
    let redirectHint: string | null = requestUrl.searchParams.get('redirect');
    if (!redirectHint && referer) {
      try {
        const refUrl = new URL(referer);
        redirectHint = refUrl.searchParams.get('redirect');
      } catch {
        redirectHint = null;
      }
    }
    const { resolvePostAuthDestination } = await import('../../../lib/authDestination');
    const next = resolvePostAuthDestination(
      { accountType, role: accountType },
      redirectHint
    ) || (accountType === 'founder' ? '/founder/onboarding/linkedin' : '/builder/home');

    // Fresh founders with no deep link still start onboarding.
    const destination =
      accountType === 'founder' && next === '/founder/home' && !redirectHint
        ? '/founder/onboarding/linkedin'
        : next;

    return json(
      { success: true, accountType, next: destination },
      200,
      { 'Set-Cookie': buildAuthTokenCookie(freshToken) }
    );
  } catch (error) {
    console.error('Set account type error:', error);
    return json({ success: false, message: 'Internal server error' }, 500);
  }
};
