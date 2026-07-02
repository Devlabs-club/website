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

export function buildAgentWrappedCommand(token: string) {
  return `npx devlabs-talent@latest analyze --token ${token}`;
}
