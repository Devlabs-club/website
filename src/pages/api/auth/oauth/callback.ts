import type { APIRoute } from 'astro';
import { generateToken } from '../../../../lib/auth.ts';
import { upsertUserFromOAuth } from '../../../../lib/adminMongo';
import { sanitizePostAuthRedirect } from '../../../../lib/oauthRedirect';
import { createWorkOS, getWorkOSConfig, runtimeEnvFromLocals } from '../../../../lib/workosEnv';

function nameFromWorkOSUser(workosUser: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  const full = `${workosUser.firstName || ''} ${workosUser.lastName || ''}`.trim();
  if (full) return full;

  const localPart = workosUser.email.split('@')[0] || 'user';
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim() || 'DevLabs User';
}

function authCookieFlags(): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

function destinationForRole(accountType: string | undefined, redirectUrl: string) {
  // /auth/select-role safely re-routes based on the user's role and preserves any
  // nested redirect (e.g. the pricing checkout target), so always honor it.
  if (redirectUrl.startsWith('/auth/select-role')) return redirectUrl;
  if (accountType === 'founder') return redirectUrl.startsWith('/founder/') ? redirectUrl : '/founder/home';
  if (accountType === 'builder') return redirectUrl.startsWith('/builder/') ? redirectUrl : '/builder/home';
  return redirectUrl;
}

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

    // WorkOS/the provider can redirect back with an error instead of a code — surface it.
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

    const user = await upsertUserFromOAuth(
      {
        email: workosUser.email,
        name: nameFromWorkOSUser(workosUser),
        oauthId: workosUser.id,
        provider: 'google',
      },
      runtime
    );

    const token = generateToken(user, runtime);
    // Founders/builders go straight to their home; users who haven't picked a role yet
    // honor the post-auth redirect (e.g. the onboarding "connect LinkedIn" next step),
    // falling back to role selection.
    const destination = destinationForRole(user.accountType, redirectUrl);

    const headers = new Headers();
    headers.set('Location', destination);
    headers.append('Set-Cookie', `auth-token=${token}; ${authCookieFlags()}`);
    if (sealedSession) {
      headers.append('Set-Cookie', `wos-session=${sealedSession}; ${authCookieFlags()}`);
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
