import type { APIRoute } from 'astro';
import { verifyOtp } from '@/lib/messaging/otp';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'bad_json' });
  }
  const { token, phone, code } = body || {};
  if (!token || !phone || !code) return json(400, { ok: false, error: 'missing_fields' });

  try {
    const res = await verifyOtp(String(token), String(phone), String(code));
    return json(res.status, {
      ok: res.ok,
      error: (res as any).error,
      attemptsLeft: (res as any).attemptsLeft,
      matchedBuilder: (res as any).matchedBuilder,
    });
  } catch (err) {
    console.error('[verify-otp]', err);
    return json(500, { ok: false, error: 'verify_failed' });
  }
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
