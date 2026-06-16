export type EnrichQueueMessage = {
  builderId: string;
  builderName?: string;
  builderEmail?: string;
};

export interface Env {
  WEBSITE_ROOT: string;
  ENRICHMENT_INTERNAL_SECRET: string;
  BUILDER_ENRICHMENT_QUEUE: Queue<EnrichQueueMessage>;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function enrichViaWebsite(env: Env, builderId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${env.WEBSITE_ROOT}/api/internal/enrich-builder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ENRICHMENT_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ builderId }),
      signal: controller.signal,
    });

  const text = await res.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (res.status === 200) {
    return { ok: true as const, status: res.status, payload };
  }

  return {
    ok: false as const,
    status: res.status,
    payload,
    error: typeof payload?.message === 'string' ? payload.message : text.slice(0, 300),
  };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'builder-enrichment' });
    }

    if (url.pathname === '/enqueue' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.ENRICHMENT_INTERNAL_SECRET}`) {
        return json({ ok: false, message: 'Unauthorized' }, 401);
      }

      let body: { builderIds?: string[] };
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, message: 'Invalid JSON' }, 400);
      }

      const builderIds = (body.builderIds || []).map((id) => id.trim()).filter(Boolean);
      if (!builderIds.length) {
        return json({ ok: false, message: 'builderIds required' }, 400);
      }

      const batchSize = 10;
      let enqueued = 0;
      for (let i = 0; i < builderIds.length; i += batchSize) {
        const chunk = builderIds.slice(i, i + batchSize);
        await env.BUILDER_ENRICHMENT_QUEUE.sendBatch(
          chunk.map((builderId) => ({ body: { builderId } }))
        );
        enqueued += chunk.length;
      }

      return json({ ok: true, enqueued });
    }

    return json({ ok: false, message: 'Not found' }, 404);
  },

  async queue(batch: MessageBatch<EnrichQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { builderId } = message.body;
      try {
        const result = await enrichViaWebsite(env, builderId);
        if (!result.ok) {
          console.error('[builder-enrichment] enrich failed', builderId, result.status, result.error);
          message.retry();
          continue;
        }
        console.log('[builder-enrichment] completed', builderId, result.status);
        message.ack();
      } catch (err) {
        console.error('[builder-enrichment] queue error', builderId, err);
        message.retry();
      }
    }
  },
};
