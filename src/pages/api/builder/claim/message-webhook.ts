import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { advanceClaimConversation } from '@/lib/builderClaim';
import { readEnv, runtimeEnvFromLocals } from '@/lib/workosEnv';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const expectedSecret = readEnv('BUILDER_CLAIM_INBOUND_WEBHOOK_SECRET', runtime);
  if (expectedSecret) {
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${expectedSecret}`) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    from?: string;
    fromPhone?: string;
    body?: string;
    text?: string;
    messageId?: string;
    id?: string;
  };
  const fromPhone = String(body.fromPhone || body.from || '');
  const text = String(body.body || body.text || '');
  if (!fromPhone || !text.trim()) {
    return json({ success: false, error: 'fromPhone and body are required.' }, 400);
  }

  await connectAdminDB();
  const result = await advanceClaimConversation(
    {
      fromPhone,
      body: text,
      providerMessageId: body.messageId || body.id || null,
    },
    runtime
  );
  if ('error' in result) return json({ success: false, error: result.error }, result.status);

  return json({
    success: true,
    completed: result.completed,
    delivery: result.delivery,
  });
};

export const prerender = false;
