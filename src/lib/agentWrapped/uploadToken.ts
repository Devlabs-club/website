import jwt from 'jsonwebtoken';
import { ensureLocalEnvLoaded } from '@/lib/loadEnv';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import type { AgentWrappedUploadTokenPayload } from './types';

ensureLocalEnvLoaded();

function getJwtSecret(runtime?: RuntimeEnv): string {
  const secret = readEnv('JWT_SECRET', runtime);
  if (!secret) throw new Error('JWT_SECRET is not defined.');
  return secret;
}

export function generateAgentWrappedUploadToken(
  payload: Omit<AgentWrappedUploadTokenPayload, 'kind'>,
  runtime?: RuntimeEnv
) {
  return jwt.sign({ ...payload, kind: 'agent_wrapped_upload' }, getJwtSecret(runtime), {
    expiresIn: '2h',
  });
}

export function verifyAgentWrappedUploadToken(
  token: string | null | undefined,
  runtime?: RuntimeEnv
): AgentWrappedUploadTokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret(runtime)) as AgentWrappedUploadTokenPayload;
    if (decoded.kind !== 'agent_wrapped_upload' || !decoded.builderId || !decoded.email) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function agentWrappedApiRoot(runtime?: RuntimeEnv) {
  return (
    readEnv('WEBSITE_ROOT', runtime) ||
    readEnv('PUBLIC_URL', runtime) ||
    'https://www.devlabs.club'
  ).replace(/\/$/, '');
}

/** CLI command shown in the builder dashboard. Includes --api so uploads hit the same host that minted the token. */
export function buildAgentWrappedCommand(token: string, runtime?: RuntimeEnv) {
  const apiRoot = agentWrappedApiRoot(runtime);
  return `npx devlabs-talent@latest analyze --token ${token} --api ${apiRoot} --public-url ${apiRoot}`;
}
