import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { findClaimByRawToken, serializeClaim } from '@/lib/builderClaim';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const token = params.token || '';
  await connectAdminDB();
  const claim = await findClaimByRawToken(token);
  if (!claim) return json({ success: false, error: 'Claim link was not found.' }, 404);
  if (claim.status === 'expired') return json({ success: false, error: 'Claim link has expired.' }, 410);
  return json({ success: true, claim: await serializeClaim(claim, runtimeEnvFromLocals(locals)) });
};

export const prerender = false;
