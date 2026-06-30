import jwt from 'jsonwebtoken';
import { ensureLocalEnvLoaded } from './loadEnv';
import { readEnv, type RuntimeEnv } from './workosEnv';

ensureLocalEnvLoaded();

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_SCOPES = ['read:user', 'repo'];

export type GithubOAuthState = {
  builderId: string;
  redirect?: string;
};

function getJwtSecret(runtime?: RuntimeEnv): string {
  const secret = readEnv('JWT_SECRET', runtime);
  if (!secret) throw new Error('JWT_SECRET is not defined');
  return secret;
}

export function getGithubOAuthConfig(runtime?: RuntimeEnv) {
  const clientId = readEnv('GITHUB_OAUTH_CLIENT_ID', runtime);
  const clientSecret = readEnv('GITHUB_OAUTH_CLIENT_SECRET', runtime);
  return { clientId, clientSecret };
}

export function hasGithubOAuthConfig(runtime?: RuntimeEnv): boolean {
  const { clientId, clientSecret } = getGithubOAuthConfig(runtime);
  return Boolean(clientId && clientSecret);
}

export function signGithubOAuthState(payload: GithubOAuthState, runtime?: RuntimeEnv): string {
  return jwt.sign(payload, getJwtSecret(runtime), { expiresIn: '15m' });
}

export function verifyGithubOAuthState(token: string, runtime?: RuntimeEnv): GithubOAuthState | null {
  try {
    return jwt.verify(token, getJwtSecret(runtime)) as GithubOAuthState;
  } catch {
    return null;
  }
}

export function getGithubOAuthRedirectUri(request: Request, runtime?: RuntimeEnv): string {
  const configured = readEnv('GITHUB_OAUTH_REDIRECT_URI', runtime);
  if (configured) return configured;
  const origin = new URL(request.url).origin;
  return `${origin}/api/builders/github/callback`;
}

export function buildGithubAuthorizeUrl(params: {
  request: Request;
  state: string;
  runtime?: RuntimeEnv;
}): string {
  const { clientId } = getGithubOAuthConfig(params.runtime);
  if (!clientId) throw new Error('GITHUB_OAUTH_CLIENT_ID is not defined');

  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', getGithubOAuthRedirectUri(params.request, params.runtime));
  url.searchParams.set('scope', GITHUB_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  return url.toString();
}

export async function exchangeGithubOAuthCode(params: {
  code: string;
  request: Request;
  runtime?: RuntimeEnv;
}): Promise<{ accessToken: string; scope: string; tokenType: string }> {
  const { clientId, clientSecret } = getGithubOAuthConfig(params.runtime);
  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth is not configured');
  }

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: getGithubOAuthRedirectUri(params.request, params.runtime),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed (${response.status})`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error(data?.error_description || data?.error || 'GitHub token exchange failed');
  }

  return {
    accessToken: String(data.access_token),
    scope: String(data.scope || ''),
    tokenType: String(data.token_type || 'bearer'),
  };
}

export async function fetchGithubUserProfile(accessToken: string): Promise<{ login: string; avatar_url?: string }> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub user profile fetch failed (${response.status})`);
  }

  const data = await response.json();
  return {
    login: String(data.login || ''),
    avatar_url: typeof data.avatar_url === 'string' ? data.avatar_url : undefined,
  };
}
