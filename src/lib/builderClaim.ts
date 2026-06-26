import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import { sendBuilderClaimMessage } from '@/lib/builderClaimMessaging';
import { findUserByEmail, updateUserAccount } from '@/lib/adminMongo';
import { checkSmsVerification, startSmsVerification } from '@/lib/twilioVerify';

const CLAIM_TTL_DAYS = 14;
const OTP_MAX_ATTEMPTS = 5;

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

export function generatePhoneCode() {
  return String(crypto.randomInt(100000, 1000000));
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

/** Private link the builder uses to view their own full profile. */
export function claimProfileViewUrl(token: string, runtime?: RuntimeEnv) {
  return `${claimBaseUrl(runtime)}/builder/p/${encodeURIComponent(token)}`;
}

/**
 * Ensure the claim has a profile-view token and return it. Mutates the claim in
 * memory (the caller persists it); the token is the secret that gates the
 * builder's private profile page.
 */
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

export async function findClaimByRawToken(rawToken: string) {
  const claim = await BuilderProfileClaim.findOne({ tokenHash: hashClaimSecret(rawToken) });
  if (!claim) return null;
  if (claim.expiresAt && claim.expiresAt.getTime() < Date.now() && claim.status !== 'expired') {
    claim.status = 'expired';
    await claim.save();
  }
  return claim;
}

export async function serializeClaim(claim: any) {
  const builder = claim.builderId
    ? await BuilderProfile.findById(claim.builderId).select('name headline email links verificationStatus').lean()
    : await BuilderProfile.findOne({ email: claim.builderEmail }).select('name headline email links verificationStatus').lean();

  return {
    id: String(claim._id),
    builderEmail: claim.builderEmail,
    builderName: builder?.name || claim.metadata?.builderName || 'Builder',
    headline: builder?.headline || null,
    status: claim.status,
    phone: claim.phone || null,
    phoneVerifiedAt: claim.phoneVerifiedAt ? new Date(claim.phoneVerifiedAt).toISOString() : null,
    expiresAt: claim.expiresAt ? new Date(claim.expiresAt).toISOString() : null,
  };
}

export async function requestClaimPhoneVerification(rawToken: string, phoneInput: string, runtime?: RuntimeEnv) {
  const claim = await findClaimByRawToken(rawToken);
  if (!claim) return { error: 'Claim link was not found.', status: 404 as const };
  if (claim.status === 'expired') return { error: 'Claim link has expired.', status: 410 as const };
  if (claim.status === 'completed') return { error: 'This builder profile was already claimed.', status: 409 as const };

  const phone = normalizeClaimPhone(phoneInput);
  if (!isPlausibleClaimPhone(phone)) {
    return { error: 'Enter a valid phone number, including country code if outside the US.', status: 400 as const };
  }

  const verification = await startSmsVerification(phone, runtime);
  claim.phone = phone;
  claim.status = 'phone_pending';
  claim.phoneVerificationProvider = 'twilio_verify';
  claim.phoneVerificationSid = verification.sid;
  claim.phoneVerificationStatus = verification.status;
  claim.phoneVerificationCodeHash = null;
  claim.phoneVerificationExpiresAt = null;
  claim.phoneVerificationAttempts = 0;

  claim.messages.push({
    direction: 'outbound',
    body: 'Sent DevLabs builder claim verification code by SMS.',
    channel: 'sms',
    providerMessageId: verification.sid,
  });
  claim.lastMessageAt = new Date();
  await claim.save();

  return {
    claim,
    delivery: { status: 'sent' as const, providerMessageId: verification.sid },
    debugCode: null,
  };
}

export async function verifyClaimPhone(rawToken: string, codeInput: string, runtime?: RuntimeEnv) {
  const claim = await findClaimByRawToken(rawToken);
  if (!claim) return { error: 'Claim link was not found.', status: 404 as const };
  if (claim.status === 'expired') return { error: 'Claim link has expired.', status: 410 as const };
  if (claim.status === 'completed') return { error: 'This builder profile was already claimed.', status: 409 as const };
  if (!claim.phone || claim.phoneVerificationProvider !== 'twilio_verify') {
    return { error: 'Request a phone verification code first.', status: 400 as const };
  }
  if (claim.phoneVerificationAttempts >= OTP_MAX_ATTEMPTS) {
    return { error: 'Too many attempts. Request a new code.', status: 429 as const };
  }

  claim.phoneVerificationAttempts += 1;
  const verification = await checkSmsVerification(claim.phone, codeInput.trim(), runtime);
  claim.phoneVerificationSid = verification.sid || claim.phoneVerificationSid;
  claim.phoneVerificationStatus = verification.status;
  if (!verification.approved) {
    await claim.save();
    return { error: 'Incorrect verification code.', status: 400 as const };
  }

  claim.status = 'phone_verified';
  claim.phoneVerifiedAt = new Date();
  claim.phoneVerificationCodeHash = null;
  claim.phoneVerificationExpiresAt = null;

  const user = await findUserByEmail(claim.builderEmail, runtime);
  if (user?._id) {
    await updateUserAccount(String(user._id), {
      phone: claim.phone,
    }, runtime);
  }

  if (claim.builderId && mongoose.Types.ObjectId.isValid(String(claim.builderId))) {
    await BuilderProfile.updateOne(
      { _id: claim.builderId },
      {
        $set: {
          ...(user?._id ? { userId: user._id } : {}),
          phone: claim.phone,
          email: claim.builderEmail,
        },
      }
    );
  }

  await claim.save();
  const start = await startClaimConversation(claim, runtime);
  return { claim, delivery: start.delivery };
}

export async function requestClaimConversationStart(rawToken: string, runtime?: RuntimeEnv) {
  const claim = await findClaimByRawToken(rawToken);
  if (!claim) return { error: 'Claim link was not found.', status: 404 as const };
  if (claim.status === 'expired') return { error: 'Claim link has expired.', status: 410 as const };
  if (claim.status === 'completed') return { error: 'This builder profile was already claimed.', status: 409 as const };
  if (!claim.phoneVerifiedAt || !claim.phone) {
    return { error: 'Verify your phone number first.', status: 400 as const };
  }

  const start = await startClaimConversation(claim, runtime);
  return { claim, delivery: start.delivery };
}

/** Map stored claim messages into agent conversation history (iMessage only). */
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

/**
 * Send a sequence of agent bubbles over iMessage and record each on the claim.
 * (We prefer several short texts over one wall of text, Poke-style.)
 */
async function sendReplies(claim: any, replies: string[], runtime?: RuntimeEnv) {
  let lastDelivery: { status: string; providerMessageId?: string | null } = { status: 'not_configured' };
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

/**
 * After the immediate "give me a sec" texts go out, run the scheduled
 * scrape/research and send the follow-up texts reacting to what we found.
 */
async function runClaimFollowUp(claim: any, followUp: { sources: any[]; research: boolean; links?: string[] }, runtime?: RuntimeEnv) {
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
 * The Poke-persona iMessage builder agent drives the whole conversation:
 * identity is settled by phone verification, so it goes straight into reading
 * the profile, scraping links, enriching gaps, ingesting resumes, and finalizing.
 */
export async function startClaimConversation(claim: any, runtime?: RuntimeEnv) {
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

export async function advanceClaimConversation(
  params: { fromPhone: string; body: string; providerMessageId?: string | null; resumeText?: string | null },
  runtime?: RuntimeEnv
) {
  const phone = normalizeClaimPhone(params.fromPhone);
  const claim = await BuilderProfileClaim.findOne({
    phone,
    status: { $in: ['phone_verified', 'conversation_started', 'completed'] },
  }).sort({ updatedAt: -1 });

  if (!claim) return { error: 'No active claim found for this phone number.', status: 404 as const };

  const body = params.body.trim();
  if (params.providerMessageId) {
    const alreadyHandled = claim.messages.some(
      (message: any) => message.direction === 'inbound' && message.providerMessageId === params.providerMessageId
    );
    if (alreadyHandled) return { claim, completed: false, delivery: { status: 'not_configured' as const } };
  }

  // History is built BEFORE we append the current inbound message.
  const history = buildAgentHistory(claim);

  claim.messages.push({
    direction: 'inbound',
    body,
    channel: 'imessage',
    providerMessageId: params.providerMessageId || null,
  });

  const { runImessageBuilderAgentTurn } = await import('@/lib/agent/runners/imessageBuilderAgent');
  const result = await runImessageBuilderAgentTurn({
    claim,
    userText: body,
    history,
    resume: params.resumeText ? { text: params.resumeText } : null,
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

  // Now do the slow scrape/research and text them the findings.
  if (result.followUp) await runClaimFollowUp(claim, result.followUp, runtime);

  return { claim, completed: result.completed, delivery: lastDelivery };
}
