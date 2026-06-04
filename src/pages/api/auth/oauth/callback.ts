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

export const GET: APIRoute = async ({ request, redirect, url, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    let redirectUrl = '/dashboard';
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

    if (!code) {
      console.error('OAuth callback: No authorization code provided');
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
      },
      runtime
    );

    const token = generateToken(user);

    const headers = new Headers();
    headers.set('Location', redirectUrl);
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
