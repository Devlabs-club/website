import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { createImessageVerifyToken, buildImessageHandoffUrls } from '@/lib/builderImessageHandoff';
import { findClaimByRawToken } from '@/lib/builderClaim';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const rawToken = String(params.token || '');
  if (!rawToken) return json({ success: false, error: 'missing_token' }, 400);

  await connectAdminDB();
  const claim = await findClaimByRawToken(rawToken);
  if (!claim) return json({ success: false, error: 'invalid_claim' }, 404);

  const builder = claim.builderId
    ? await BuilderProfile.findById(claim.builderId).lean()
    : await BuilderProfile.findOne({ email: claim.builderEmail }).lean();

  const signed = createImessageVerifyToken(
    {
      email: claim.builderEmail,
      name: claim.metadata?.builderName || (builder as any)?.name,
      builderId: claim.builderId ? String(claim.builderId) : (builder as any)?._id ? String((builder as any)._id) : undefined,
    },
    runtime
  );
  const handoff = buildImessageHandoffUrls({ token: signed, runtime });

  return json({
    success: true,
    builderName: (builder as any)?.name || claim.metadata?.builderName || claim.builderEmail.split('@')[0],
    builderEmail: claim.builderEmail,
    phoneVerified: Boolean(claim.phoneVerifiedAt || (builder as any)?.phoneVerifiedAt),
    messageBody: handoff.messageBody,
    imessageUrl: handoff.imessageUrl,
    smsUrl: handoff.smsUrl,
    agentPhone: handoff.phone,
  });
};

export const prerender = false;
