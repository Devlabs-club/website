import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { verifyClaimToken } from '@/lib/messaging/claimToken';
import { createImessageVerifyToken, buildImessageHandoffUrls } from '@/lib/builderImessageHandoff';
import { findClaimByRawToken } from '@/lib/builderClaim';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** GET — iMessage handoff for email-invite flow (?t=signedToken). */
export const GET: APIRoute = async ({ url, params, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const signedFromQuery = url.searchParams.get('t') || '';
  const rawClaimToken = params.token || '';

  await connectAdminDB();

  let email = '';
  let name: string | undefined;
  let builderId: string | undefined;
  let phoneVerified = false;

  if (signedFromQuery) {
    const payload = verifyClaimToken(signedFromQuery, runtime);
    if (!payload) return json({ success: false, error: 'invalid_or_expired_link' }, 410);
    email = payload.email;
    name = payload.name;
    builderId = payload.builderId;
  } else if (rawClaimToken) {
    const claim = await findClaimByRawToken(rawClaimToken);
    if (!claim) return json({ success: false, error: 'invalid_claim' }, 404);
    email = claim.builderEmail;
    name = claim.metadata?.builderName;
    builderId = claim.builderId ? String(claim.builderId) : undefined;
    phoneVerified = Boolean(claim.phoneVerifiedAt);
  } else {
    return json({ success: false, error: 'missing_token' }, 400);
  }

  const builder = builderId
    ? await BuilderProfile.findById(builderId).lean()
    : await BuilderProfile.findOne({ email }).lean();

  if (!phoneVerified) {
    phoneVerified = Boolean((builder as any)?.phoneVerifiedAt);
  }

  const signed = createImessageVerifyToken(
    {
      email,
      name: name || (builder as any)?.name,
      builderId: builderId || ((builder as any)?._id ? String((builder as any)._id) : undefined),
    },
    runtime
  );
  const handoff = buildImessageHandoffUrls({ token: signed, runtime });

  return json({
    success: true,
    builderName: (builder as any)?.name || name || email.split('@')[0],
    builderEmail: email,
    phoneVerified,
    messageBody: handoff.messageBody,
    imessageUrl: handoff.imessageUrl,
    smsUrl: handoff.smsUrl,
    agentPhone: handoff.phone,
  });
};

export const prerender = false;
