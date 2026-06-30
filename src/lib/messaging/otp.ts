import crypto from 'node:crypto';
import { connectDB } from '@/lib/mongodb';
import PhoneVerification from '@/models/talent/PhoneVerification';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ImessageConversation from '@/models/talent/ImessageConversation';
import { bluebubblesProvider } from './providers/bluebubbles';
import { normalizeHandle } from './types';
import { verifyClaimToken } from './claimToken';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function isPhone(handle: string) {
  return !handle.includes('@') && handle.replace(/\D/g, '').length >= 10;
}

/** Step 1: send a 6-digit OTP over iMessage to the entered phone. */
export async function sendOtp(token: string, rawPhone: string) {
  const claim = verifyClaimToken(token);
  if (!claim) return { ok: false, status: 401, error: 'invalid_link' };

  const phone = normalizeHandle(rawPhone);
  if (!isPhone(phone)) return { ok: false, status: 400, error: 'invalid_phone' };

  await connectDB();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

  await PhoneVerification.findOneAndUpdate(
    { phone, email: claim.email },
    {
      $set: {
        phone,
        email: claim.email,
        builderId: claim.builderId || null,
        codeHash: hashCode(code),
        attempts: 0,
        consumed: false,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    },
    { upsert: true, new: true }
  );

  await bluebubblesProvider.send(
    { handle: phone, chatGuid: null },
    `Your DevLabs code is ${code}. It expires in 10 minutes.`
  );

  return { ok: true, status: 200 };
}

/** Step 2: check the OTP; on success attach the phone to the builder and have the agent say hi. */
export async function verifyOtp(token: string, rawPhone: string, code: string) {
  const claim = verifyClaimToken(token);
  if (!claim) return { ok: false, status: 401, error: 'invalid_link' };

  const phone = normalizeHandle(rawPhone);
  await connectDB();

  const pv = await PhoneVerification.findOne({ phone, email: claim.email });
  if (!pv || pv.consumed || pv.expiresAt < new Date()) return { ok: false, status: 400, error: 'expired' };
  if (pv.attempts >= MAX_ATTEMPTS) return { ok: false, status: 429, error: 'too_many_attempts' };

  if (pv.codeHash !== hashCode((code || '').trim())) {
    pv.attempts += 1;
    await pv.save();
    return { ok: false, status: 400, error: 'wrong_code', attemptsLeft: MAX_ATTEMPTS - pv.attempts };
  }

  pv.consumed = true;
  await pv.save();

  // Attach verified phone to the builder (resolve by token builderId, else by email).
  const builder = claim.builderId
    ? await BuilderProfile.findById(claim.builderId)
    : await BuilderProfile.findOne({ email: claim.email });

  await greetVerifiedBuilder(builder, phone);

  return { ok: true, status: 200, matchedBuilder: Boolean(builder) };
}

/**
 * Post-verification handoff: attach the verified phone to the builder, open the
 * iMessage conversation thread, and have the DevLabs agent text them first
 * (Poke-style). Channel-agnostic — works whether the OTP itself was delivered
 * over iMessage (legacy) or Twilio SMS. `builder` may be null (no match yet).
 */
export async function greetVerifiedBuilder(builder: any | null, phone: string) {
  await connectDB();

  if (builder) {
    builder.phone = phone;
    builder.phoneVerifiedAt = new Date();
    await builder.save();
  }

  // Open the conversation thread keyed by the verified phone.
  await ImessageConversation.findOneAndUpdate(
    { handle: phone },
    {
      $set: {
        handle: phone,
        builderId: builder?._id || null,
        claimState: 'resolved',
        service: 'iMessage',
      },
    },
    { upsert: true }
  );

  // The agent texts them first (we now have their number).
  const firstName = (builder?.name || '').split(' ')[0] || 'there';
  const welcome =
    `Hey ${firstName} 👋 it's DevLabs. You're verified. ` +
    `I already built your builder profile from your public work — want to take a quick look and make it founder-readable? (reply "yes" or "show me")`;
  try {
    await bluebubblesProvider.send({ handle: phone, chatGuid: null }, welcome);
    await ImessageConversation.updateOne(
      { handle: phone },
      { $push: { messages: { role: 'assistant', content: welcome, at: new Date() } }, $set: { lastOutboundAt: new Date(), claimState: 'confirming' } }
    );
  } catch (err) {
    console.error('[otp] welcome send failed', err);
  }
}
