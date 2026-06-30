import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { startSmsVerification, checkSmsVerification, getTwilioVerifyConfig } from '@/lib/twilioVerify';
import { greetVerifiedBuilder } from '@/lib/messaging/otp';

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

  const profile = await BuilderProfile.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  });
  if (!profile) return json({ ok: false, error: 'no_profile' }, 404);

  const action = String(body.action || '');
  const phone = normalizePhone(String(body.phone || ''));
  if (!phone) return json({ ok: false, error: 'invalid_phone' }, 400);

  try {
    if (action === 'start') {
      await startSmsVerification(phone, runtime);
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

      // Verified: attach the phone and hand off to the iMessage agent.
      await greetVerifiedBuilder(profile, phone);
      return json({ ok: true });
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
