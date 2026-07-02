import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { requestClaimPhoneVerification, serializeClaim } from '@/lib/builderClaim';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const token = params.token || '';
  const body = (await request.json().catch(() => ({}))) as { phone?: string };
  const runtime = runtimeEnvFromLocals(locals);
  await connectAdminDB();
  const result = await requestClaimPhoneVerification(token, String(body.phone || ''), runtime);
  if ('error' in result) return json({ success: false, error: result.error }, result.status);
  return json({
    success: true,
    claim: await serializeClaim(result.claim, runtime),
    delivery: result.delivery,
    debugCode: result.debugCode,
  });
};

export const prerender = false;
