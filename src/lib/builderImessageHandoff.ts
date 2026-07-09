import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import { createClaimToken, verifyClaimToken, type ClaimTokenPayload } from '@/lib/messaging/claimToken';
import { getImessageProviderName } from '@/lib/messaging/getProvider';

export type ImessageContact = {
  /** Phone (E.164) or Apple ID email the builder texts to open the thread. */
  address: string;
  kind: 'email' | 'phone';
};

/** DevLabs agent line for AgentPhone — E.164 phone number. */
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

/** Apple ID / email signed into BlueBubbles iMessage on the Mac. */
export function getBlueBubblesImessageAddress(runtime?: RuntimeEnv): string | null {
  const raw =
    readEnv('BLUEBUBBLES_IMESSAGE_ADDRESS', runtime) ||
    readEnv('DEVLABS_IMESSAGE_ADDRESS', runtime) ||
    'hi@geekydan.dev';
  const trimmed = raw.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

/** Where builders should text to start the DevLabs agent thread. */
export function getDevlabsImessageContact(runtime?: RuntimeEnv): ImessageContact | null {
  if (getImessageProviderName(runtime) === 'bluebubbles') {
    const address = getBlueBubblesImessageAddress(runtime);
    return address ? { address, kind: 'email' } : null;
  }
  const phone = getDevlabsImessagePhone(runtime);
  return phone ? { address: phone, kind: 'phone' } : null;
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

function buildDeepLink(contact: ImessageContact, messageBody: string) {
  const encoded = encodeURIComponent(messageBody);
  if (contact.kind === 'email') {
    // imessage:// opens Messages to an Apple ID email (BlueBubbles pilot).
    return `imessage://${contact.address}&body=${encoded}`;
  }
  const phoneDigits = contact.address.replace(/[^\d+]/g, '');
  return `sms:${phoneDigits}?body=${encoded}`;
}

export function buildImessageHandoffUrls(params: { token: string; runtime?: RuntimeEnv }) {
  const contact = getDevlabsImessageContact(params.runtime);
  const messageBody = buildVerificationMessageBody(params.token);
  if (!contact) {
    return {
      contact: null as ImessageContact | null,
      phone: null as string | null,
      messageBody,
      smsUrl: null,
      imessageUrl: null,
    };
  }

  const deepLink = buildDeepLink(contact, messageBody);
  return {
    contact,
    phone: contact.kind === 'phone' ? contact.address : null,
    imessageAddress: contact.kind === 'email' ? contact.address : null,
    messageBody,
    smsUrl: contact.kind === 'phone' ? deepLink : null,
    imessageUrl: deepLink,
  };
}

/** JSON payload for claim / signup iMessage handoff API routes. */
export async function buildClaimHandoffResponse(params: {
  email: string;
  name?: string;
  builderId?: string;
  phoneVerified?: boolean;
  runtime?: RuntimeEnv;
}) {
  const signed = createImessageVerifyToken(
    {
      email: params.email,
      name: params.name,
      builderId: params.builderId,
    },
    params.runtime
  );
  const handoff = buildImessageHandoffUrls({ token: signed, runtime: params.runtime });

  return {
    success: true as const,
    builderName: params.name || params.email.split('@')[0],
    builderEmail: params.email,
    phoneVerified: Boolean(params.phoneVerified),
    messageBody: handoff.messageBody,
    imessageUrl: handoff.imessageUrl,
    smsUrl: handoff.smsUrl,
    agentPhone: handoff.phone,
    imessageAddress: handoff.imessageAddress,
    agentContact: handoff.contact?.address || handoff.phone || handoff.imessageAddress || null,
  };
}

/** True when the inbound looks like our verification handshake (not ongoing chat). */
export function isVerificationHandshake(body: string) {
  const text = String(body || '').trim().toLowerCase();
  if (parseVerifyTokenFromMessage(body)) return true;
  return /^(hi|hey|hello|yo)\b/.test(text) && text.length < 120;
}
