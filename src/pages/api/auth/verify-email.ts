import type { APIRoute } from 'astro';
import { jsonWithCookies, readPendingAuthCookie } from '../../../lib/authCookie.ts';
import { notifyOps, opsPersonFrom } from '../../../lib/opsTelegram';
import {
  completeWorkOSAuthentication,
  getWorkOSClient,
  parseWorkOSAuthError,
  publicAuthUser,
  workosSessionOptions,
} from '../../../lib/workosAuth';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    const body = (await request.json().catch(() => ({}))) as { code?: string; redirect?: string };
    const code = String(body.code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      return jsonWithCookies({ success: false, message: 'Enter the 6-digit code from your email.' }, 400);
    }

    const pendingAuthenticationToken = readPendingAuthCookie(request.headers.get('cookie'));
    if (!pendingAuthenticationToken) {
      return jsonWithCookies(
        {
          success: false,
          message: 'This verification session expired. Log in again to get a new code.',
        },
        400
      );
    }

    const { workos, clientId } = getWorkOSClient(runtime);
    const authenticated = await workos.userManagement.authenticateWithEmailVerification({
      clientId,
      code,
      pendingAuthenticationToken,
      session: workosSessionOptions(runtime),
    });

    const completed = await completeWorkOSAuthentication({
      workosUser: authenticated.user,
      sealedSession: authenticated.sealedSession,
      runtime,
      redirect: typeof body.redirect === 'string' ? body.redirect : null,
    });

    if (completed.user.isNew) {
      notifyOps({
        event: 'account_created',
        title: `New account verified ${opsPersonFrom(completed.user.name, completed.user.email)}`,
      });
    }

    return jsonWithCookies(
      {
        success: true,
        next: completed.next,
        user: publicAuthUser(completed.user),
      },
      200,
      completed.cookies
    );
  } catch (error) {
    const parsed = parseWorkOSAuthError(error);
    console.error('Verify email error:', error);
    return jsonWithCookies(
      {
        success: false,
        message:
          parsed.code === 'invalid_grant'
            ? 'That code is invalid or has expired. Request a new one and try again.'
            : parsed.message || 'Could not verify this email.',
      },
      400
    );
  }
};
