import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import type { InboundAttachment } from '@/lib/messaging/bluebubblesAttachments';
import { processBlueBubblesResumeAttachment } from '@/lib/messaging/inboundResume';
import type { InboundResumePdf, ResumeInbound } from '@/lib/messaging/inboundResume';
import type { RuntimeEnv } from '@/lib/workosEnv';
import { normalizeHandle } from '@/lib/messaging/types';

const PENDING_TTL_MS = 5 * 60 * 1000;

export type PendingResumeAttachment = {
  guid: string;
  fileName: string | null;
  mimeType: string | null;
  receivedAt: string;
};

function normalizeClaimPhone(phone: string) {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function pendingResumeFromAttachment(att: InboundAttachment): PendingResumeAttachment {
  return {
    guid: att.guid,
    fileName: att.transferName || null,
    mimeType: att.mimeType || null,
    receivedAt: new Date().toISOString(),
  };
}

/** Remember a resume PDF guid so a follow-up text-only webhook can pair with it. */
export async function stashPendingResumeAttachment(phone: string, pending: PendingResumeAttachment) {
  const normalized = normalizeClaimPhone(phone);
  if (!normalized) return;

  const claim = await BuilderProfileClaim.findOne({
    phone: normalized,
    status: { $in: ['phone_verified', 'conversation_started', 'completed'] },
  }).sort({ updatedAt: -1 });

  if (!claim) return;

  claim.metadata = claim.metadata || {};
  claim.metadata.pendingResumeAttachment = pending;
  claim.markModified('metadata');
  await claim.save();
}

export async function clearPendingResumeAttachment(phone: string) {
  const normalized = normalizeClaimPhone(phone);
  if (!normalized) return;

  await BuilderProfileClaim.updateOne(
    {
      phone: normalized,
      status: { $in: ['phone_verified', 'conversation_started', 'completed'] },
      'metadata.pendingResumeAttachment': { $exists: true },
    },
    { $unset: { 'metadata.pendingResumeAttachment': '' } }
  );
}

/**
 * iMessage often delivers the PDF and caption as separate webhooks. If this turn
 * has no parsed resume yet, retry the stashed attachment guid.
 */
export async function resolvePendingResumeAttachment(
  phone: string,
  runtime?: RuntimeEnv
): Promise<{
  resumeText: string | null;
  resumeExtracted: Record<string, unknown> | null;
  resumePdf: InboundResumePdf | null;
  resumeInbound: ResumeInbound | null;
  clearedPending: boolean;
}> {
  const normalized = normalizeClaimPhone(phone);
  const empty = {
    resumeText: null,
    resumeExtracted: null,
    resumePdf: null,
    resumeInbound: null,
    clearedPending: false,
  };
  if (!normalized) return empty;

  const claim = await BuilderProfileClaim.findOne({
    phone: normalized,
    status: { $in: ['phone_verified', 'conversation_started', 'completed'] },
  }).sort({ updatedAt: -1 });

  const pending = claim?.metadata?.pendingResumeAttachment as PendingResumeAttachment | undefined;
  if (!pending?.guid) return empty;

  const age = Date.now() - new Date(pending.receivedAt).getTime();
  if (age > PENDING_TTL_MS) {
    await clearPendingResumeAttachment(normalized);
    return empty;
  }

  const result = await processBlueBubblesResumeAttachment(
    {
      guid: pending.guid,
      transferName: pending.fileName,
      mimeType: pending.mimeType,
    },
    runtime
  );

  if (result.status === 'parsed') {
    await clearPendingResumeAttachment(normalized);
    return {
      resumeText: result.text,
      resumeExtracted: result.extracted as Record<string, unknown>,
      resumePdf: result.pdf,
      resumeInbound: result,
      clearedPending: true,
    };
  }

  return {
    ...empty,
    resumeInbound: result,
  };
}

export function looksLikeResumeIntent(text: string) {
  return /\bresume\b/i.test(text) || /\(sent a resume/i.test(text);
}

export function phoneFromBlueBubblesBody(body: unknown): string | null {
  const payload = body as { data?: { handle?: { address?: string }; chats?: Array<{ chatIdentifier?: string }> } };
  const m = payload?.data;
  if (!m) return null;
  const chat = Array.isArray(m.chats) && m.chats.length ? m.chats[0] : null;
  const rawAddress = m.handle?.address || chat?.chatIdentifier || '';
  return rawAddress ? normalizeHandle(rawAddress) : null;
}
