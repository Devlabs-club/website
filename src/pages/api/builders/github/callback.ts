import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import {
  exchangeGithubOAuthCode,
  fetchGithubUserProfile,
  hasGithubOAuthConfig,
  verifyGithubOAuthState,
} from '@/lib/githubOAuth';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');

  if (error) {
    return redirect(`/builder/home?github=${encodeURIComponent(error)}`);
  }

  if (!hasGithubOAuthConfig(runtime) || !code || !stateParam) {
    return redirect('/builder/home?github=oauth_failed');
  }

  const state = verifyGithubOAuthState(stateParam, runtime);
  if (!state?.builderId) {
    return redirect('/builder/home?github=invalid_state');
  }

  try {
    await connectAdminDB();
    const token = await exchangeGithubOAuthCode({ code, request, runtime });
    const profile = await fetchGithubUserProfile(token.accessToken);

    const scopes = token.scope
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);

    await BuilderProfile.findByIdAndUpdate(state.builderId, {
      $set: {
        'links.github': `https://github.com/${profile.login}`,
        'integrations.github.accessToken': token.accessToken,
        'integrations.github.username': profile.login,
        'integrations.github.scopes': scopes,
        'integrations.github.connectedAt': new Date(),
        ...(profile.avatar_url ? { avatarUrl: profile.avatar_url } : {}),
      },
    });

    const { invalidateBuilderActivityCache } = await import('@/lib/builderActivity/githubActivity');
    invalidateBuilderActivityCache();

    const destination = state.redirect || '/builder/home?github=connected';
    return redirect(destination);
  } catch (err) {
    console.error('[builders/github/callback] failed', err);
    return redirect('/builder/home?github=oauth_failed');
  }
};
