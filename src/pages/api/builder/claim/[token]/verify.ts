import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { serializeClaim, verifyClaimPhone } from '@/lib/builderClaim';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const token = params.token || '';
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  await connectAdminDB();
  const result = await verifyClaimPhone(token, String(body.code || ''), runtimeEnvFromLocals(locals));
  if ('error' in result) return json({ success: false, error: result.error }, result.status);
  return json({
    success: true,
    claim: await serializeClaim(result.claim),
    delivery: result.delivery,
  });
};

export const prerender = false;
