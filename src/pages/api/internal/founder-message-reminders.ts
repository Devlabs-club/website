import type { APIRoute } from 'astro';
import { proxyToNodeBackend, shouldUseApiProxy } from '@/lib/apiProxy';

export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return json({ success: false, message: 'Unauthorized' }, 401);
}

export const POST: APIRoute = async (context) => {
  if (shouldUseApiProxy(context.locals)) {
    return proxyToNodeBackend(context.request, context.locals);
  }

  const secret = process.env.ENRICHMENT_INTERNAL_SECRET?.trim();
  if (!secret) return json({ success: false, message: 'Not configured' }, 503);

  const auth = context.request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${secret}`) return unauthorized();

  try {
    const { connectAdminDB } = await import('@/lib/mongodb');
    const { sendPendingFounderUnreadReminders } = await import('@/lib/talent/messageFlow');
    await connectAdminDB();
    const result = await sendPendingFounderUnreadReminders();
    return json({ success: true, ...result });
  } catch (error) {
    console.error('[internal/founder-message-reminders] failed', error);
    return json(
      { success: false, message: error instanceof Error ? error.message : 'reminder_failed' },
      500
    );
  }
};
