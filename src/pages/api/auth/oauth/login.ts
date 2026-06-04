import type { APIRoute } from 'astro';
import { getOAuthRedirectUri } from '../../../../lib/oauthRedirect';
import { createWorkOS, getWorkOSConfig, runtimeEnvFromLocals } from '../../../../lib/workosEnv';

export const GET: APIRoute = async ({ request, redirect, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    const url = new URL(request.url);
    const redirectParam = url.searchParams.get('redirect')?.trim();
    const postAuthPath = redirectParam || '/dashboard';
    const workos = createWorkOS(runtime);
    const { clientId } = getWorkOSConfig(runtime);
    if (!clientId) throw new Error('WORKOS_CLIENT_ID missing');

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      provider: 'GoogleOAuth',
      redirectUri: getOAuthRedirectUri(request, runtime),
      clientId,
      state: JSON.stringify({ redirect: postAuthPath }),
      prompt: 'select_account',
    });

    return new Response(null, {
      status: 302,
      headers: { Location: authorizationUrl },
    });
  } catch (error) {
    console.error('OAuth login initiation failed:', error);

    const url = new URL(request.url);
    const redirectParam = url.searchParams.get('redirect');
    const redirectQuery = redirectParam ? `&redirect=${encodeURIComponent(redirectParam)}` : '';

    return redirect(`/login?error=oauth_init_failed${redirectQuery}`);
  }
};
