import type { APIRoute } from 'astro';
import { updateUserAccount } from '../../../lib/adminMongo';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

    const next = accountType === 'founder' ? '/founder/onboarding/linkedin' : '/builder/home';
    return json({ success: true, accountType, next });
  } catch (error) {
    console.error('Set account type error:', error);
    return json({ success: false, message: 'Internal server error' }, 500);
  }
};
