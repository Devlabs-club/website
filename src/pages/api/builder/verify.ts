import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { startSmsVerification, checkSmsVerification, getTwilioVerifyConfig } from '@/lib/twilioVerify';
import { createBuilderClaimForEmail, startClaimConversation, normalizeClaimPhone } from '@/lib/builderClaim';
import BuilderProfileClaim from '@/models/talent/BuilderProfileClaim';
import { buildAgentWrappedCommand, generateAgentWrappedUploadToken } from '@/lib/agentWrapped/uploadToken';

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Coerce user input to E.164 (Twilio requires it). Defaults to US/CA (+1). */
function normalizePhone(raw: string) {
  const cleaned = raw.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

/**
 * Phone verification for the logged-in builder (the builder home gate).
 *
 * OTP delivery uses Twilio Verify (managed SMS) — reliable and the same path the
 * builder claim flow uses. BlueBubbles is reserved for the post-verification
 * handoff, where the DevLabs iMessage agent texts the builder first.
 *
 * POST { action: 'start',   phone }        -> Twilio texts a verification code
 * POST { action: 'confirm', phone, code }  -> checks the code; on success attaches
 *                                             the phone and the agent texts them.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const runtime = runtimeEnvFromLocals(locals);

  if (!getTwilioVerifyConfig(runtime)) {
    console.error('[builder/verify] Twilio Verify is not configured');
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  const authToken =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  const decoded = authToken ? verifyToken(authToken, runtime) : null;
  if (!decoded) return json({ ok: false, error: 'not_authenticated' }, 401);

  await connectAdminDB();
  const user = await findUserById(decoded.userId, runtime);
  if (!user) return json({ ok: false, error: 'not_authenticated' }, 401);

  const userEmail = String(user.email || '').toLowerCase().trim();
  if (!userEmail) return json({ ok: false, error: 'missing_email' }, 400);

  // A brand-new builder may have no profile yet — that's fine. Verification
  // starts a claim and the iMessage agent builds the profile from scratch.
  let profile = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: userEmail }],
  });

  const action = String(body.action || '');
  const phone = normalizePhone(String(body.phone || ''));
  if (!phone) return json({ ok: false, error: 'invalid_phone' }, 400);

  try {
    if (action === 'start') {
      const verification = await startSmsVerification(phone, runtime);
      const claimPhone = normalizeClaimPhone(phone);
      const builderEmail = String(profile?.email || userEmail).toLowerCase().trim();
      const claimOr: Record<string, unknown>[] = [{ builderEmail }];
      if (profile) claimOr.push({ builderId: profile._id });
      let claim = await BuilderProfileClaim.findOne({
        status: { $ne: 'expired' },
        $or: claimOr,
      }).sort({ updatedAt: -1 });
      if (!claim) {
        claim = (await createBuilderClaimForEmail(builderEmail, runtime)).claim;
      }

      claim.builderId = claim.builderId || profile?._id || null;
      claim.builderEmail = claim.builderEmail || builderEmail;
      claim.phone = claimPhone;
      claim.phoneVerificationProvider = 'twilio_verify';
      claim.phoneVerificationSid = verification.sid;
      claim.phoneVerificationStatus = verification.status;
      claim.phoneVerificationAttempts = 0;
      claim.phoneVerifiedAt = null;
      claim.status = 'phone_pending';
      await claim.save();
      return json({ ok: true });
    }

    if (action === 'confirm') {
      const code = String(body.code || '').trim();
      if (!code) return json({ ok: false, error: 'missing_code' }, 400);

      let approved = false;
      try {
        const res = await checkSmsVerification(phone, code, runtime);
        approved = res.approved;
      } catch (err) {
        // Twilio 404s once the verification is consumed/expired/max-attempts.
        console.warn('[builder/verify] check failed', err);
        return json({ ok: false, error: 'expired' }, 400);
      }

      if (!approved) return json({ ok: false, error: 'wrong_code' }, 400);

      // Verified. Wire the builder onto the same claim backbone the inbound
      // iMessage webhook uses, then kick off the real agent conversation.
      // (Without a claim, the builder's replies hit advanceClaimConversation's
      // "No active claim found" 404 and the agent never responds.)
      const claimPhone = normalizeClaimPhone(phone);
      const builderEmail = String(profile?.email || userEmail).toLowerCase().trim();

      const claimOr: Record<string, unknown>[] = [{ phone: claimPhone }, { builderEmail }];
      if (profile) claimOr.push({ builderId: profile._id });
      let claim = await BuilderProfileClaim.findOne({
        status: { $ne: 'expired' },
        $or: claimOr,
      }).sort({ updatedAt: -1 });
      if (!claim) {
        claim = (await createBuilderClaimForEmail(builderEmail, runtime)).claim;
      }

      claim.builderId = claim.builderId || profile?._id || null;
      claim.builderEmail = claim.builderEmail || builderEmail;
      claim.phone = claimPhone;
      claim.phoneVerificationProvider = 'twilio_verify';
      claim.phoneVerifiedAt = new Date();
      claim.status = 'phone_verified';
      await claim.save();

      if (!profile) {
        profile = await BuilderProfile.create({
          userId: user._id,
          name: user.name || userEmail.split('@')[0] || 'DevLabs Builder',
          email: userEmail,
          phone: claimPhone,
          phoneVerifiedAt: new Date(),
          visibilityStatus: 'matched_only',
          verificationStatus: 'builder_confirmed',
        });
      } else {
        profile.phone = claimPhone;
        profile.phoneVerifiedAt = new Date();
        await profile.save();
      }

      claim.builderId = claim.builderId || profile._id;
      await claim.save();

      await updateUserAccount(String(user._id), { phone: claimPhone }, runtime);

      // Kick off the iMessage builder agent (it sends the first texts).
      const conversationStart = await startClaimConversation(claim, runtime);

      const uploadToken = generateAgentWrappedUploadToken(
        { builderId: String(profile._id), email: builderEmail },
        runtime
      );

      return json({
        ok: true,
        agentWrapped: {
          builderId: String(profile._id),
          uploadToken,
          command: buildAgentWrappedCommand(uploadToken, runtime),
          publicUrl: `/builder/wrapped/${String(profile._id)}`,
        },
        messageDelivery: conversationStart.delivery,
      });
    }

    return json({ ok: false, error: 'bad_action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[builder/verify]', message);
    // Twilio rejects malformed numbers with a 60200 "Invalid parameter" error.
    if (/invalid|60200|not a valid/i.test(message)) {
      return json({ ok: false, error: 'invalid_phone' }, 400);
    }
    return json({ ok: false, error: 'verify_failed' }, 500);
  }
};
