import crypto from 'node:crypto';

/**
 * Stateless signed token embedded in the claim-email "Talk to us" link.
 * Proves the person opening the verify page owns the email we sent it to,
 * so we only attach a verified phone to the builder who was actually emailed.
 * HMAC-SHA256 with JWT_SECRET — no DB storage needed.
 */
const secret = () => process.env.JWT_SECRET || 'dev-secret-change-me';

type ClaimPayload = { email: string; builderId?: string };

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString('base64url');
}

export function createClaimToken(payload: ClaimPayload, ttlDays = 30): string {
  const body = { ...payload, exp: Date.now() + ttlDays * 86_400_000 };
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyClaimToken(token: string): ClaimPayload | null {
  const [data, sig] = (token || '').split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (typeof body.exp !== 'number' || body.exp < Date.now()) return null;
    return { email: body.email, builderId: body.builderId };
  } catch {
    return null;
  }
}
