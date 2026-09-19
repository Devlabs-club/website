import { OauthException, type User as WorkOSUser, type WorkOS } from '@workos-inc/node';
import { generateToken } from '@/lib/auth';
import {
  buildAuthTokenCookie,
  buildPendingAuthCookie,
  buildWorkOSSessionCookie,
  clearPendingAuthCookie,
} from '@/lib/authCookie';
import { upsertUserFromWorkOS, type AuthUser } from '@/lib/adminMongo';
import { resolvePostAuthDestination } from '@/lib/authDestination';
import { createWorkOS, getWorkOSConfig, type RuntimeEnv } from '@/lib/workosEnv';

export type WorkOSAuthError = {
  code: string | null;
  pendingAuthenticationToken: string | null;
  message: string;
};

export function nameFromWorkOSUser(workosUser: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  const full = `${workosUser.firstName || ''} ${workosUser.lastName || ''}`.trim();
  if (full) return full;

  const localPart = workosUser.email.split('@')[0] || 'user';
  return (
    localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .trim() || 'DevLabs User'
  );
}

export function splitDisplayName(name: string, email: string) {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    return {
      firstName: parts[0],
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
    };
  }
  return {
    firstName: email.split('@')[0] || 'DevLabs',
    lastName: undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function parseWorkOSAuthError(error: unknown): WorkOSAuthError {
  if (error instanceof OauthException) {
    const raw = asRecord(error.rawData);
    const pending = raw.pending_authentication_token || raw.pendingAuthenticationToken;
    return {
      code: error.error || (typeof raw.error === 'string' ? raw.error : null),
      pendingAuthenticationToken: typeof pending === 'string' && pending ? pending : null,
      message: error.errorDescription || error.message || 'Authentication failed',
    };
  }

  const raw = asRecord(error);
  const nested = asRecord(raw.rawData);
  const pending =
    nested.pending_authentication_token ||
    nested.pendingAuthenticationToken ||
    raw.pending_authentication_token;
  const code =
    (typeof raw.code === 'string' && raw.code) ||
    (typeof raw.error === 'string' && raw.error) ||
    (typeof nested.error === 'string' && nested.error) ||
    (typeof nested.code === 'string' && nested.code) ||
    null;
  return {
    code,
    pendingAuthenticationToken: typeof pending === 'string' && pending ? pending : null,
    message:
      (typeof raw.errorDescription === 'string' && raw.errorDescription) ||
      (typeof raw.message === 'string' && raw.message) ||
      (error instanceof Error ? error.message : 'Authentication failed'),
  };
}

export function workosSessionOptions(runtime?: RuntimeEnv) {
  const { cookiePassword } = getWorkOSConfig(runtime);
  if (!cookiePassword) return undefined;
  return { sealSession: true as const, cookiePassword };
}

export async function findWorkOSUserByEmail(workos: WorkOS, email: string) {
  const users = await workos.userManagement.listUsers({ email: email.toLowerCase() });
  return users.data[0] || null;
}

export async function createOrUpdateWorkOSPasswordUser(params: {
  workos: WorkOS;
  email: string;
  password: string;
  name: string;
}): Promise<WorkOSUser> {
  const email = params.email.toLowerCase();
  const names = splitDisplayName(params.name, email);
  const existing = await findWorkOSUserByEmail(params.workos, email);

  if (existing) {
    if (existing.emailVerified) {
      const error = new Error('User already exists with this email');
      (error as Error & { code?: string }).code = 'user_already_exists';
      throw error;
    }
    return params.workos.userManagement.updateUser({
      userId: existing.id,
      password: params.password,
      firstName: names.firstName,
      lastName: names.lastName,
    });
  }

  return params.workos.userManagement.createUser({
    email,
    password: params.password,
    firstName: names.firstName,
    lastName: names.lastName,
    emailVerified: false,
  });
}

export async function upsertAppUserFromWorkOS(
  workosUser: WorkOSUser,
  runtime?: RuntimeEnv,
  provider?: 'google' | null
) {
  return upsertUserFromWorkOS(
    {
      email: workosUser.email,
      name: nameFromWorkOSUser(workosUser),
      workosUserId: workosUser.id,
      emailVerified: workosUser.emailVerified === true,
      provider: provider ?? null,
      avatarUrl: workosUser.profilePictureUrl,
    },
    runtime
  );
}

export function publicAuthUser(user: AuthUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    accountType: user.accountType ?? null,
    onboardingStatus: user.onboardingStatus ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

export function destinationForUser(user: AuthUser, redirect?: string | null) {
  return resolvePostAuthDestination(
    { accountType: user.accountType ?? null, role: user.role },
    redirect
  );
}

export function sessionCookies(token: string, sealedSession?: string | null) {
  const cookies = [buildAuthTokenCookie(token), clearPendingAuthCookie()];
  if (sealedSession) cookies.push(buildWorkOSSessionCookie(sealedSession));
  return cookies;
}

export function verificationRequiredCookies(pendingAuthenticationToken: string) {
  return [buildPendingAuthCookie(pendingAuthenticationToken)];
}

export async function completeWorkOSAuthentication(params: {
  workosUser: WorkOSUser;
  sealedSession?: string | null;
  runtime?: RuntimeEnv;
  provider?: 'google' | null;
  redirect?: string | null;
}) {
  const user = await upsertAppUserFromWorkOS(params.workosUser, params.runtime, params.provider);
  const token = generateToken(user, params.runtime);
  return {
    user,
    token,
    next: destinationForUser(user, params.redirect),
    cookies: sessionCookies(token, params.sealedSession),
  };
}

export function getWorkOSClient(runtime?: RuntimeEnv) {
  const workos = createWorkOS(runtime);
  const { clientId, cookiePassword } = getWorkOSConfig(runtime);
  if (!clientId) throw new Error('WORKOS_CLIENT_ID missing');
  return { workos, clientId, cookiePassword };
}
