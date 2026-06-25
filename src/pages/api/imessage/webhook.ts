import type { APIRoute } from 'astro';
import { bluebubblesProvider } from '@/lib/messaging/providers/bluebubbles';
import { handleInbound } from '@/lib/messaging/imessageGateway';

export const prerender = false;

/**
 * Inbound iMessage webhook (BlueBubbles for the pilot).
 * Configure in BlueBubbles Server → Settings → Webhooks:
 *   URL:    http://localhost:4321/api/imessage/webhook?secret=<BLUEBUBBLES_WEBHOOK_SECRET>
 *   Events: New Messages
 *
 * Always returns 200 quickly so BlueBubbles doesn't retry; processing is awaited
 * but errors are swallowed into 200 to avoid duplicate deliveries.
 */
export const POST: APIRoute = async ({ request }) => {
  let rawBody: unknown = null;
  try {
    rawBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: true, ignored: 'bad_json' }), { status: 200 });
  }

  const url = new URL(request.url);
  const provider = bluebubblesProvider;

  if (!provider.verifyInbound({ searchParams: url.searchParams, headers: request.headers, rawBody })) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
  }

  const inbound = provider.parseInbound(rawBody);
  if (!inbound) return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });

  try {
    await handleInbound(inbound, provider);
  } catch (err) {
    console.error('[imessage/webhook] handler error', err);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
