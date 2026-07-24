import type { APIRoute } from 'astro';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { verifyClaimToken } from '@/lib/messaging/claimToken';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET — verify a signed invite/identity token from the welcome email and return the builder's email/name. */
export const GET: APIRoute = async ({ url, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const token = url.searchParams.get('t') || '';
  if (!token) return json({ success: false, error: 'missing_token' }, 400);

  const payload = verifyClaimToken(token, runtime);
  if (!payload) return json({ success: false, error: 'invalid_or_expired' }, 410);

  return json({
    success: true,
    email: payload.email,
    name: payload.name || null,
    builderId: payload.builderId || null,
  });
};

export const prerender = false;
