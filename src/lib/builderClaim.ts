import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import { sendBuilderClaimMessage } from '@/lib/builderClaimMessaging';
import { findUserByEmail, updateUserAccount } from '@/lib/adminMongo';
import {
  parseVerifyTokenFromMessage,
  verifyImessageToken,
  isVerificationHandshake,
} from '@/lib/builderImessageHandoff';
import {
  buildBuilderDossier,
  applyDossierToProfile,
  formatDossierForAgent,
  type BuilderDossier,
} from '@/lib/talent/builderDossier';
import { appendSessionMemory, formatSessionMemoryBlock } from '@/lib/talent/builderSessionMemory';
import { buildAgentWrappedCommand, generateAgentWrappedUploadToken } from '@/lib/agentWrapped/uploadToken';

const CLAIM_TTL_DAYS = 14;

export function normalizeClaimEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeClaimPhone(phone: string) {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function isPlausibleClaimPhone(phone: string) {
  return /^\+\d{10,15}$/.test(phone);
}

export function createClaimToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashClaimSecret(secret: string) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function claimBaseUrl(runtime?: RuntimeEnv) {
  return (
    readEnv('WEBSITE_ROOT', runtime) ||
    readEnv('PUBLIC_URL', runtime) ||
    'https://devlabs.club'
  ).replace(/\/$/, '');
}

export function claimUrlForToken(token: string, runtime?: RuntimeEnv) {
  return `${claimBaseUrl(runtime)}/builder/claim/${encodeURIComponent(token)}`;
}

/** Landing page for email-invite handoff → iMessage. */
export function claimHandoffUrl(signedToken: string, runtime?: RuntimeEnv) {
  return `${claimBaseUrl(runtime)}/builder/start?t=${encodeURIComponent(signedToken)}`;
}

/** Private link the builder uses to view their own full profile. */
export function claimProfileViewUrl(token: string, runtime?: RuntimeEnv) {
  return `${claimBaseUrl(runtime)}/builder/p/${encodeURIComponent(token)}`;
}

export function ensureClaimViewToken(claim: any) {
  if (!claim.viewToken) claim.viewToken = createClaimToken();
  return claim.viewToken as string;
}

export async function findClaimByViewToken(token: string) {
  if (!token) return null;
  return BuilderProfileClaim.findOne({ viewToken: token });
}

export async function createBuilderClaimForEmail(email: string, runtime?: RuntimeEnv) {
  const builderEmail = normalizeClaimEmail(email);
  const builder = await BuilderProfile.findOne({ email: builderEmail }).select('_id email name').lean();
  const token = createClaimToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000);

  const claim = await BuilderProfileClaim.create({
    builderId: builder?._id || null,
    builderEmail,
    tokenHash: hashClaimSecret(token),
    status: 'email_sent',
    expiresAt,
    metadata: {
      source: 'claim_email',
      builderName: builder?.name || null,
    },
  });

  return {
    token,
    url: claimUrlForToken(token, runtime),
    claim,
    builder,
  };
}

/** Find or create a claim row for a signed iMessage verify token payload. */
export async function ensureClaimForVerifyPayload(
  payload: { email: string; name?: string; builderId?: string },
  runtime?: RuntimeEnv
) {
  const builderEmail = normalizeClaimEmail(payload.email);
  const builder =
    payload.builderId && mongoose.Types.ObjectId.isValid(payload.builderId)
      ? await BuilderProfile.findById(payload.builderId).lean()
      : await BuilderProfile.findOne({ email: builderEmail }).lean();

  let claim = await BuilderProfileClaim.findOne({
    builderEmail,
    status: { $nin: ['expired', 'completed'] },
  }).sort({ updatedAt: -1 });

  if (!claim) {
    const token = createClaimToken();
    claim = await BuilderProfileClaim.create({
      builderId: builder?._id || null,
      builderEmail,
      tokenHash: hashClaimSecret(token),
      status: 'email_sent',
      expiresAt: new Date(Date.now() + CLAIM_TTL_DAYS * 86_400_000),
      metadata: {
        source: 'imessage_verify',
        builderName: payload.name || builder?.name || null,
      },
    });
  }

  if (payload.name && !claim.metadata?.builderName) {
    claim.metadata = { ...(claim.metadata || {}), builderName: payload.name };
  }
  if (builder?._id && !claim.builderId) claim.builderId = builder._id;
  return claim;
}

export async function findClaimByRawToken(rawToken: string) {
  const claim = await BuilderProfileClaim.findOne({ tokenHash: hashClaimSecret(rawToken) });
  if (!claim) return null;
  if (claim.expiresAt && claim.expiresAt.getTime() < Date.now() && claim.status !== 'expired') {
    claim.status = 'expired';
    await claim.save();
  }
  return claim;
}

export async function serializeClaim(claim: any, runtime?: RuntimeEnv) {
  const builder = claim.builderId
    ? await BuilderProfile.findById(claim.builderId).select('name headline email links verificationStatus').lean()
    : await BuilderProfile.findOne({ email: claim.builderEmail }).select('name headline email links verificationStatus').lean();
  const builderId = claim.builderId ? String(claim.builderId) : builder?._id ? String(builder._id) : null;
  const uploadToken =
    builderId && claim.phoneVerifiedAt
      ? generateAgentWrappedUploadToken({ builderId, email: claim.builderEmail }, runtime)
      : null;

  return {
    id: String(claim._id),
    builderId,
    builderEmail: claim.builderEmail,
    builderName: builder?.name || claim.metadata?.builderName || 'Builder',
    headline: builder?.headline || null,
    status: claim.status,
    phone: claim.phone || null,
    phoneVerifiedAt: claim.phoneVerifiedAt ? new Date(claim.phoneVerifiedAt).toISOString() : null,
    expiresAt: claim.expiresAt ? new Date(claim.expiresAt).toISOString() : null,
    agentWrapped: uploadToken
      ? {
          builderId,
          uploadToken,
          command: buildAgentWrappedCommand(uploadToken, runtime),
          publicUrl: `/builder/wrapped/${builderId}`,
        }
      : null,
  };
}

/** Run dossier research before the agent's first text (Poke-style homework). */
export async function ensureClaimDossier(claim: any, runtime?: RuntimeEnv): Promise<BuilderDossier | null> {
  if (claim.metadata?.dossier?.builtAt) return claim.metadata.dossier as BuilderDossier;

  const name = claim.metadata?.builderName || claim.builderEmail?.split('@')[0];
  const dossier = await buildBuilderDossier({
    email: claim.builderEmail,
    name,
    builderId: claim.builderId ? String(claim.builderId) : null,
    runtime,
  });

  claim.metadata = { ...(claim.metadata || {}), dossier };
  await claim.save();

  if (claim.builderId) {
    try {
      await applyDossierToProfile(String(claim.builderId), dossier);
    } catch (err) {
      console.warn('[builder-claim] apply dossier failed', err);
    }
  }

  return dossier;
}

/** Bind phone from inbound iMessage and mark verified — the "hi" IS the OTP. */
export async function verifyClaimFromInboundMessage(
  claim: any,
  phone: string,
  runtime?: RuntimeEnv
) {
  const normalized = normalizeClaimPhone(phone);
  if (!isPlausibleClaimPhone(normalized)) {
    return { error: 'Invalid phone number from iMessage.', status: 400 as const };
  }

  claim.phone = normalized;
  claim.phoneVerifiedAt = new Date();
  claim.status = 'phone_verified';

  const user = await findUserByEmail(claim.builderEmail, runtime);
  if (user?._id) {
    await updateUserAccount(String(user._id), { phone: normalized }, runtime);
  }

  if (claim.builderId && mongoose.Types.ObjectId.isValid(String(claim.builderId))) {
    await BuilderProfile.updateOne(
      { _id: claim.builderId },
      {
        $set: {
          ...(user?._id ? { userId: user._id } : {}),
          phone: normalized,
          phoneVerifiedAt: new Date(),
          email: claim.builderEmail,
        },
      }
    );
  } else {
    const existing = await BuilderProfile.findOne({ email: claim.builderEmail });
    if (existing) {
      existing.phone = normalized;
      existing.phoneVerifiedAt = new Date();
      if (user?._id) existing.userId = user._id;
      await existing.save();
      claim.builderId = existing._id;
    } else {
      const created = await BuilderProfile.create({
        ...(user?._id ? { userId: user._id } : {}),
        name: claim.metadata?.builderName || claim.builderEmail.split('@')[0] || 'DevLabs Builder',
        email: claim.builderEmail,
        phone: normalized,
        phoneVerifiedAt: new Date(),
        visibilityStatus: 'matched_only',
        verificationStatus: 'builder_confirmed',
      });
      claim.builderId = created._id;
    }
  }

  appendSessionMemory(claim, `Phone verified via iMessage handshake (${normalized}).`);
  await claim.save();
  return { claim };
}

function buildAgentHistory(claim: any): Array<{ role: 'user' | 'assistant'; content: string }> {
  return (claim.messages || [])
    .filter((m: any) => (m.channel || 'imessage') === 'imessage' && m.body)
    .map((m: any) => ({
      role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: String(m.body),
    }));
}

async function finalizeClaimAccount(claim: any, runtime?: RuntimeEnv) {
  claim.status = 'completed';
  claim.completedAt = new Date();
  if (claim.builderId) {
    const user = await findUserByEmail(claim.builderEmail, runtime);
    await BuilderProfile.updateOne(
      { _id: claim.builderId },
      {
        $set: {
          ...(user?._id ? { userId: user._id } : {}),
          phone: claim.phone,
          email: claim.builderEmail,
          verificationStatus: 'builder_confirmed',
        },
      }
    );
    if (user?._id) {
      await updateUserAccount(String(user._id), {
        role: 'builder',
        accountType: 'builder',
        onboardingStatus: 'complete',
      }, runtime);
    }
  }
}

async function sendReplies(claim: any, replies: string[], runtime?: RuntimeEnv) {
  let lastDelivery: { status: string; providerMessageId?: string | null; error?: string } = { status: 'not_configured' };
  let anySent = false;
  for (const body of replies) {
    if (!body?.trim()) continue;
    const delivery = await sendBuilderClaimMessage(
      {
        toPhone: claim.phone,
        body,
        claimId: String(claim._id),
        builderId: claim.builderId ? String(claim.builderId) : null,
        purpose: 'claim_conversation',
      },
      runtime
    );
    if (delivery.status === 'sent') anySent = true;
    else {
      const reason =
        delivery.status === 'delivery_failed'
          ? delivery.error
          : 'iMessage delivery is not configured.';
      claim.conversationFailures = claim.conversationFailures || [];
      claim.conversationFailures.push(`outbound_delivery_failed: ${reason}`);
    }
    lastDelivery = delivery;
    claim.messages.push({
      direction: 'outbound',
      body,
      channel: 'imessage',
      providerMessageId: delivery.status === 'sent' ? delivery.providerMessageId || null : null,
    });
  }
  claim.lastMessageAt = new Date();
  return { lastDelivery, anySent };
}

async function runClaimFollowUp(
  claim: any,
  followUp: { sources: any[]; research: boolean; links?: string[] },
  runtime?: RuntimeEnv
) {
  try {
    const { runImessageBuilderAgentTurn } = await import('@/lib/agent/runners/imessageBuilderAgent');
    const result = await runImessageBuilderAgentTurn({
      claim,
      history: buildAgentHistory(claim),
      mode: 'followup',
      followUpJob: { sources: followUp.sources as any, research: followUp.research, links: followUp.links || [] },
      runtime,
    });
    claim.builderId = result.builderId;
    await sendReplies(claim, result.replies, runtime);
    if (result.completed && claim.status !== 'completed') {
      await finalizeClaimAccount(claim, runtime);
    }
    await claim.save();
  } catch (err) {
    console.error('[builder-claim] follow-up turn failed', err);
  }
}

/**
 * First agent texts after verification. Runs dossier research first, then kickoff.
 */
export async function startClaimConversation(claim: any, runtime?: RuntimeEnv) {
  await ensureClaimDossier(claim, runtime);

  const { runImessageBuilderAgentTurn } = await import('@/lib/agent/runners/imessageBuilderAgent');
  const result = await runImessageBuilderAgentTurn({
    claim,
    history: buildAgentHistory(claim),
    kickoff: true,
    runtime,
  });

  claim.builderId = result.builderId;
  const { lastDelivery, anySent } = await sendReplies(claim, result.replies, runtime);
  claim.status = anySent ? 'conversation_started' : 'phone_verified';
  await claim.save();

  if (result.followUp) await runClaimFollowUp(claim, result.followUp, runtime);

  return { delivery: lastDelivery };
}

/**
 * Resolve an inbound iMessage: verification handshake OR ongoing conversation.
 */
export async function advanceClaimConversation(
  params: {
    fromPhone: string;
    body: string;
    providerMessageId?: string | null;
    resumeText?: string | null;
    resumeExtracted?: Record<string, unknown> | null;
  },
  runtime?: RuntimeEnv
) {
  const phone = normalizeClaimPhone(params.fromPhone);
  const body = params.body.trim();

  // Idempotency
  if (params.providerMessageId) {
    const dupe = await BuilderProfileClaim.findOne({
      'messages.providerMessageId': params.providerMessageId,
      'messages.direction': 'inbound',
    });
    if (dupe) return { claim: dupe, completed: dupe.status === 'completed', delivery: { status: 'not_configured' as const } };
  }

  let claim = await BuilderProfileClaim.findOne({
    phone,
    status: { $in: ['phone_verified', 'conversation_started', 'completed'] },
  }).sort({ updatedAt: -1 });

  const tokenRaw = parseVerifyTokenFromMessage(body);
  const isVerifyAttempt = tokenRaw || (isVerificationHandshake(body) && !claim);

  // --- Verification handshake: first "hi devlabs:TOKEN" binds phone + email ---
  if (!claim && tokenRaw) {
    const payload = verifyImessageToken(tokenRaw, runtime);
    if (!payload?.email) {
      return { error: 'That verification link expired or is invalid. Open Messages from the DevLabs email again.', status: 400 as const };
    }
    claim = await ensureClaimForVerifyPayload(payload, runtime);
    const verified = await verifyClaimFromInboundMessage(claim, phone, runtime);
    if ('error' in verified) return verified;

    claim.messages.push({
      direction: 'inbound',
      body,
      channel: 'imessage',
      providerMessageId: params.providerMessageId || null,
    });

    const start = await startClaimConversation(claim, runtime);
    return { claim, completed: false, delivery: start.delivery, verified: true };
  }

  if (!claim) {
    return {
      error: 'No profile linked to this number. Open Messages from your DevLabs email or builder home page first.',
      status: 404 as const,
    };
  }

  if (isVerifyAttempt && claim.status === 'email_sent') {
    const verified = await verifyClaimFromInboundMessage(claim, phone, runtime);
    if ('error' in verified) return verified;
    claim.messages.push({
      direction: 'inbound',
      body,
      channel: 'imessage',
      providerMessageId: params.providerMessageId || null,
    });
    const start = await startClaimConversation(claim, runtime);
    return { claim, completed: false, delivery: start.delivery, verified: true };
  }

  // --- Normal conversation turn ---
  const history = buildAgentHistory(claim);

  claim.messages.push({
    direction: 'inbound',
    body: body || '(sent a resume)',
    channel: 'imessage',
    providerMessageId: params.providerMessageId || null,
  });

  const { runImessageBuilderAgentTurn } = await import('@/lib/agent/runners/imessageBuilderAgent');
  const result = await runImessageBuilderAgentTurn({
    claim,
    userText: body || '(sent a resume)',
    history,
    resume: params.resumeText
      ? { text: params.resumeText, extracted: params.resumeExtracted || undefined }
      : null,
    runtime,
  });

  claim.builderId = result.builderId;
  const { lastDelivery } = await sendReplies(claim, result.replies, runtime);

  if (result.completed && claim.status !== 'completed') {
    await finalizeClaimAccount(claim, runtime);
  } else if (claim.status === 'phone_verified') {
    claim.status = 'conversation_started';
  }

  await claim.save();

  if (result.followUp) await runClaimFollowUp(claim, result.followUp, runtime);

  return { claim, completed: result.completed, delivery: lastDelivery };
}

export async function notifyBuilderOfIntro(
  params: {
    builderId: string;
    builderEmail: string;
    founderName: string;
    company: string;
    roleTitle: string;
    schedulingLink?: string | null;
  },
  runtime?: RuntimeEnv
): Promise<boolean> {
  const claim = await BuilderProfileClaim.findOne({
    $or: [{ builderId: params.builderId }, { builderEmail: params.builderEmail.toLowerCase() }],
    phone: { $ne: null },
    phoneVerifiedAt: { $ne: null },
  }).sort({ updatedAt: -1 });
  if (!claim) return false;

  const { runImessageBuilderAgentTurn } = await import('@/lib/agent/runners/imessageBuilderAgent');
  const result = await runImessageBuilderAgentTurn({
    claim,
    history: buildAgentHistory(claim),
    intro: {
      founderName: params.founderName,
      company: params.company,
      roleTitle: params.roleTitle,
      schedulingLink: params.schedulingLink ?? null,
    },
    runtime,
  });

  claim.builderId = result.builderId;
  await sendReplies(claim, result.replies, runtime);
  await claim.save();
  return true;
}
