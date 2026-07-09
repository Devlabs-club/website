import crypto from 'node:crypto';
import { normalizeMessageId } from '@/lib/talent/emailThreadText';

const FROM_EMAIL = process.env.CLAIM_FROM || process.env.MAIL_FROM || 'people@devlabs.club';

export function generateRfcMessageId({
  threadId,
  kind,
  nonce,
}: {
  threadId: string;
  kind: string;
  nonce?: string;
}) {
  const safeNonce = nonce ?? crypto.randomUUID();
  return `<devlabs.${kind}.${threadId}.${safeNonce}@devlabs.club>`;
}

export function normalizeThreadSubject(subject: string) {
  return subject.replace(/^(re:\s*)+/i, '').trim();
}

export function getOutboundThreadSubject(thread: { emailSubject?: string | null }) {
  if (!thread.emailSubject) return 'DevLabs conversation';
  return normalizeThreadSubject(thread.emailSubject);
}

export function uniqueMessageIds(ids: Array<string | null | undefined>, limit = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = normalizeMessageId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(-limit);
}

export function normalizeEmail(email: string | null | undefined) {
  return String(email || '').trim().toLowerCase();
}

export function hashReplyToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateReplyToken() {
  return crypto.randomBytes(16).toString('base64url');
}

export function replyAddressForThread(threadId: string, token?: string | null) {
  const domain = process.env.SENDGRID_INBOUND_REPLY_DOMAIN?.trim();
  if (!domain) return process.env.TALENT_REPLY_EMAIL?.trim() || FROM_EMAIL;
  const cleanDomain = domain.replace(/^@/, '');
  const base = `reply+thread_${threadId}`;
  return token ? `${base}_${token}@${cleanDomain}` : `${base}@${cleanDomain}`;
}

export function parseThreadRecipient(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const match = String(value || '').match(/reply\+thread_([a-f0-9]{24})(?:_([A-Za-z0-9_-]+))?@/i);
    if (match?.[1]) return { threadId: match[1], token: match[2] || null };
  }
  return null;
}

export function replyTokenForThread(threadId: string): string | null {
  const secret =
    process.env.SENDGRID_INBOUND_REPLY_SECRET?.trim() ||
    process.env.ENRICHMENT_INTERNAL_SECRET?.trim();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`thread:${threadId}`).digest('base64url').slice(0, 22);
}

export function verifyReplyToken(thread: { replyTokenHash?: string | null; _id?: { toString(): string } }, token: string | null) {
  if (!thread.replyTokenHash) return true;
  const threadId = thread._id?.toString();
  if (!threadId) return false;
  const expected = replyTokenForThread(threadId);
  if (!expected) return true;
  if (token && token === expected) return true;
  return hashReplyToken(expected) === thread.replyTokenHash;
}

export async function ensureThreadReplyToken(thread: {
  _id: { toString(): string };
  replyTokenHash?: string | null;
  save(): Promise<unknown>;
}) {
  const threadId = thread._id.toString();
  const token = replyTokenForThread(threadId);
  if (!token) return null;
  if (!thread.replyTokenHash) {
    thread.replyTokenHash = hashReplyToken(token);
    await thread.save();
  }
  return token;
}

export function resolveSenderRole(
  thread: { founderEmail?: string | null; builderEmail?: string | null },
  builderEmailFallback: string | null | undefined,
  fromEmail: string
): 'founder' | 'builder' | null {
  const normalized = normalizeEmail(fromEmail);
  if (normalized === normalizeEmail(thread.founderEmail)) return 'founder';
  const builder = normalizeEmail(thread.builderEmail || builderEmailFallback);
  if (builder && normalized === builder) return 'builder';
  return null;
}

export function parseInboundHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    headers[key] = headers[key] ? `${headers[key]} ${val}` : val;
  }
  return headers;
}

export function isAutoReply(headers: Record<string, string>) {
  const autoSubmitted = headers['auto-submitted']?.toLowerCase();
  const precedence = headers['precedence']?.toLowerCase();
  return (
    autoSubmitted === 'auto-replied' ||
    autoSubmitted === 'auto-generated' ||
    precedence === 'bulk' ||
    precedence === 'junk' ||
    precedence === 'list' ||
    Boolean(headers['x-autoreply']) ||
    Boolean(headers['x-autorespond']) ||
    Boolean(headers['x-auto-response-suppress'])
  );
}

export function getFromDisplayName(
  senderRole: 'founder' | 'builder' | 'system',
  thread: { founderName?: string | null },
  override?: string | null
) {
  if (override) return override;
  if (senderRole === 'founder' && thread.founderName) return `${thread.founderName} via DevLabs`;
  if (senderRole === 'system') return 'DevLabs Intros';
  return 'DevLabs';
}

type ThreadSideState = {
  firstMessageId?: string | null;
  lastMessageId?: string | null;
  references?: string[];
};

export function recipientThreadState(
  thread: {
    founderThreadState?: ThreadSideState | null;
    builderThreadState?: ThreadSideState | null;
    rootMessageId?: string | null;
  },
  recipientRole: 'founder' | 'builder'
): ThreadSideState {
  return (recipientRole === 'founder' ? thread.founderThreadState : thread.builderThreadState) || {};
}

export function buildOutboundThreadHeaders(
  thread: {
    founderThreadState?: ThreadSideState | null;
    builderThreadState?: ThreadSideState | null;
    rootMessageId?: string | null;
  },
  recipientRole: 'founder' | 'builder',
  outboundMessageId: string
) {
  const side = recipientThreadState(thread, recipientRole);
  const inReplyTo = normalizeMessageId(side.lastMessageId) || null;
  const references = uniqueMessageIds(
    [...(side.references || []), thread.rootMessageId, inReplyTo],
    20
  );

  const headers: Record<string, string> = {
    'Message-ID': outboundMessageId,
  };
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
  if (references.length) headers.References = references.join(' ');
  return { inReplyTo, references, headers };
}

export function applyOutboundThreadState(
  thread: {
    founderThreadState?: ThreadSideState | null;
    builderThreadState?: ThreadSideState | null;
    rootMessageId?: string | null;
    lastMessageId?: string | null;
    references?: string[];
    emailSubject?: string | null;
    markModified?(key: string): void;
  },
  recipientRole: 'founder' | 'builder',
  outboundMessageId: string,
  opts?: { emailSubject?: string; setRoot?: boolean }
) {
  const sideKey = recipientRole === 'founder' ? 'founderThreadState' : 'builderThreadState';
  const side = { ...(recipientThreadState(thread, recipientRole) || {}) };
  if (!side.firstMessageId) side.firstMessageId = outboundMessageId;
  side.lastMessageId = outboundMessageId;
  side.references = uniqueMessageIds([...(side.references || []), outboundMessageId], 20);

  if (recipientRole === 'founder') thread.founderThreadState = side;
  else thread.builderThreadState = side;

  if (opts?.setRoot && !thread.rootMessageId) thread.rootMessageId = outboundMessageId;
  if (opts?.emailSubject && !thread.emailSubject) thread.emailSubject = opts.emailSubject;

  thread.lastMessageId = outboundMessageId;
  thread.references = uniqueMessageIds([...(thread.references || []), outboundMessageId], 50);

  thread.markModified?.(sideKey);
  thread.markModified?.('references');
}
