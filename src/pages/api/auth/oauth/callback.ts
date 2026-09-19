import type { APIRoute } from 'astro';
import { generateToken } from '../../../../lib/auth.ts';
import { sanitizePostAuthRedirect } from '../../../../lib/oauthRedirect';
import { notifyOps, opsPersonFrom } from '../../../../lib/opsTelegram';
import {
  buildAuthTokenCookie,
  buildWorkOSSessionCookie,
} from '../../../../lib/authCookie.ts';
import {
  destinationForUser,
  nameFromWorkOSUser,
  upsertAppUserFromWorkOS,
} from '../../../../lib/workosAuth';
import { createWorkOS, getWorkOSConfig, runtimeEnvFromLocals } from '../../../../lib/workosEnv';

export const GET: APIRoute = async ({ request, redirect, url, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    let redirectUrl = '/auth/select-role';
    let redirectParamStr = '';

    if (stateParam) {
      try {
        const stateObj = JSON.parse(stateParam);
        if (stateObj.redirect) {
          redirectUrl = sanitizePostAuthRedirect(stateObj.redirect, request, runtime);
          redirectParamStr = `&redirect=${encodeURIComponent(redirectUrl)}`;
        }
      } catch {
        if (stateParam.startsWith('/')) {
          redirectUrl = sanitizePostAuthRedirect(stateParam, request, runtime);
          redirectParamStr = `&redirect=${encodeURIComponent(redirectUrl)}`;
        }
      }
    }

    const oauthError = url.searchParams.get('error');
    const oauthErrorDescription = url.searchParams.get('error_description');
    if (oauthError || oauthErrorDescription) {
      console.error('OAuth callback: provider returned an error', {
        provider: 'google',
        error: oauthError,
        error_description: oauthErrorDescription,
        query: url.search,
      });
      const reason = encodeURIComponent(oauthErrorDescription || oauthError || 'oauth_provider_error');
      return redirect(`/login?error=oauth_provider_error&reason=${reason}${redirectParamStr}`);
    }

    if (!code) {
      console.error('OAuth callback: No authorization code provided', { provider: 'google', query: url.search });
      return redirect(`/login?error=oauth_no_code${redirectParamStr}`);
    }

    const workos = createWorkOS(runtime);
    const { clientId, cookiePassword } = getWorkOSConfig(runtime);

    if (!clientId || !cookiePassword) {
      throw new Error('WorkOS client ID or cookie password not configured');
    }

    const authenticateResponse = await workos.userManagement.authenticateWithCode({
      clientId,
      code,
      session: {
        sealSession: true,
        cookiePassword,
      },
    });

    const { user: workosUser, sealedSession } = authenticateResponse;

    if (!workosUser) {
      console.error('OAuth callback: Failed to get user from WorkOS');
      return redirect(`/login?error=oauth_user_fetch_failed${redirectParamStr}`);
    }

    const user = await upsertAppUserFromWorkOS(workosUser, runtime, 'google');

    if (user.isNew) {
      notifyOps({
        event: 'account_created',
        title: `New account created ${opsPersonFrom(user.name || nameFromWorkOSUser(workosUser), user.email)}`,
      });
    }

    const token = generateToken(user, runtime);
    const destination = destinationForUser(user, redirectUrl);

    const headers = new Headers();
    headers.set('Location', destination);
    headers.append('Set-Cookie', buildAuthTokenCookie(token));
    if (sealedSession) {
      headers.append('Set-Cookie', buildWorkOSSessionCookie(sealedSession));
    }

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error('OAuth callback error:', error);

    let redirectParamStr = '';
    const stateParam = url.searchParams.get('state');
    if (stateParam) {
      try {
        const stateObj = JSON.parse(stateParam);
        if (stateObj.redirect) {
          redirectParamStr = `&redirect=${encodeURIComponent(stateObj.redirect)}`;
        }
      } catch {
        if (stateParam.startsWith('/')) {
          redirectParamStr = `&redirect=${encodeURIComponent(stateParam)}`;
        }
      }
    }

    return redirect(`/login?error=oauth_callback_failed${redirectParamStr}`);
  }
};
