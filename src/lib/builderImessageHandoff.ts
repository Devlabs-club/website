import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import { createClaimToken, verifyClaimToken, type ClaimTokenPayload } from '@/lib/messaging/claimToken';

/** DevLabs agent line — E.164. Prefer AgentPhone number. */
export function getDevlabsImessagePhone(runtime?: RuntimeEnv): string | null {
  const raw =
    readEnv('AGENTPHONE_FROM_NUMBER', runtime) ||
    readEnv('DEVLABS_IMESSAGE_PHONE', runtime) ||
    null;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : null;
}

/** Signed token embedded in the builder's first iMessage to verify identity + phone. */
export function createImessageVerifyToken(payload: ClaimTokenPayload, runtime?: RuntimeEnv) {
  return createClaimToken(payload, 30, runtime);
}

export function verifyImessageToken(token: string, runtime?: RuntimeEnv): ClaimTokenPayload | null {
  return verifyClaimToken(token, runtime);
}

/** Parse the signed token from an inbound "hi devlabs:…" verification message. */
export function parseVerifyTokenFromMessage(body: string): string | null {
  const text = String(body || '').trim();
  if (!text) return null;
  const inline = text.match(/devlabs[: ]\s*([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i);
  if (inline?.[1]) return inline[1];
  const jwtLike = text.match(/([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/);
  return jwtLike?.[1] || null;
}

export function buildVerificationMessageBody(token: string) {
  return `hi devlabs:${token}`;
}

export function buildImessageHandoffUrls(params: { token: string; runtime?: RuntimeEnv }) {
  const phone = getDevlabsImessagePhone(params.runtime);
  if (!phone) {
    return { phone: null as string | null, messageBody: buildVerificationMessageBody(params.token), smsUrl: null, imessageUrl: null };
  }
  const messageBody = buildVerificationMessageBody(params.token);
  const encoded = encodeURIComponent(messageBody);
  const phoneDigits = phone.replace(/[^\d+]/g, '');
  return {
    phone,
    messageBody,
    smsUrl: `sms:${phoneDigits}?body=${encoded}`,
    imessageUrl: `sms:${phoneDigits}?body=${encoded}`,
  };
}

/** True when the inbound looks like our verification handshake (not ongoing chat). */
export function isVerificationHandshake(body: string) {
  const text = String(body || '').trim().toLowerCase();
  if (parseVerifyTokenFromMessage(body)) return true;
  return /^(hi|hey|hello|yo)\b/.test(text) && text.length < 120;
}
