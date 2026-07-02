import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { requestClaimConversationStart, serializeClaim } from '@/lib/builderClaim';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ params, locals }) => {
  const token = params.token || '';
  const runtime = runtimeEnvFromLocals(locals);
  await connectAdminDB();
  const result = await requestClaimConversationStart(token, runtime);
  if ('error' in result) return json({ success: false, error: result.error }, result.status);
  return json({
    success: true,
    claim: await serializeClaim(result.claim, runtime),
    delivery: result.delivery,
  });
};

export const prerender = false;
