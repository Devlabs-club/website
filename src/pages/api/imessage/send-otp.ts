import type { APIRoute } from 'astro';
import { sendOtp } from '@/lib/messaging/otp';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'bad_json' });
  }
  const { token, phone } = body || {};
  if (!token || !phone) return json(400, { ok: false, error: 'missing_fields' });

  try {
    const res = await sendOtp(String(token), String(phone));
    return json(res.status, { ok: res.ok, error: (res as any).error });
  } catch (err) {
    console.error('[send-otp]', err);
    return json(500, { ok: false, error: 'send_failed' });
  }
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
