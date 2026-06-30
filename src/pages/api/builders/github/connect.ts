import type { APIRoute } from 'astro';
import { resolveAuthedBuilder } from '@/lib/events/builderAuth';
import {
  buildGithubAuthorizeUrl,
  hasGithubOAuthConfig,
  signGithubOAuthState,
} from '@/lib/githubOAuth';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  if (!hasGithubOAuthConfig(runtime)) {
    return redirect('/builder/home?github=oauth_not_configured');
  }

  const auth = await resolveAuthedBuilder(request);
  if ('error' in auth) {
    const returnTo = encodeURIComponent('/api/builders/github/connect');
    return redirect(`/login?redirect=${returnTo}`);
  }

  const url = new URL(request.url);
  const postRedirect = url.searchParams.get('redirect')?.trim() || '/builder/home?github=connected';

  const state = signGithubOAuthState(
    {
      builderId: String(auth.builder._id),
      redirect: postRedirect,
    },
    runtime
  );

  const authorizeUrl = buildGithubAuthorizeUrl({ request, state, runtime });
  return redirect(authorizeUrl);
};
