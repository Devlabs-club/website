import crypto from 'node:crypto';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

/**
 * Stateless signed token for iMessage verification handoff.
 * Embedded in the builder's first "hi devlabs:TOKEN" message — proves email
 * identity and binds their iMessage phone number.
 */
export type ClaimTokenPayload = { email: string; name?: string; builderId?: string };

function secret(runtime?: RuntimeEnv) {
  return readEnv('JWT_SECRET', runtime) || 'dev-secret-change-me';
}

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString('base64url');
}

export function createClaimToken(payload: ClaimTokenPayload, ttlDays = 30, runtime?: RuntimeEnv): string {
  const body = { ...payload, exp: Date.now() + ttlDays * 86_400_000 };
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret(runtime)).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyClaimToken(token: string, runtime?: RuntimeEnv): ClaimTokenPayload | null {
  const [data, sig] = (token || '').split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', secret(runtime)).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (typeof body.exp !== 'number' || body.exp < Date.now()) return null;
    if (!body.email || typeof body.email !== 'string') return null;
    return {
      email: body.email,
      name: typeof body.name === 'string' ? body.name : undefined,
      builderId: typeof body.builderId === 'string' ? body.builderId : undefined,
    };
  } catch {
    return null;
  }
}
