import crypto from 'node:crypto';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

const API_BASE = 'https://api.agentphone.ai';

export type AgentPhoneConfig = {
  apiKey: string;
  agentId: string | null;
  fromNumber: string | null;
  webhookSecret: string | null;
};

export function getAgentPhoneConfig(runtime?: RuntimeEnv): AgentPhoneConfig | null {
  const apiKey = readEnv('AGENTPHONE_API_KEY', runtime);
  if (!apiKey) return null;
  return {
    apiKey,
    agentId: readEnv('AGENTPHONE_AGENT_ID', runtime) || null,
    fromNumber:
      readEnv('AGENTPHONE_FROM_NUMBER', runtime) ||
      readEnv('DEVLABS_IMESSAGE_PHONE', runtime) ||
      null,
    webhookSecret: readEnv('AGENTPHONE_WEBHOOK_SECRET', runtime) || null,
  };
}

export function hasAgentPhoneConfig(runtime?: RuntimeEnv) {
  return Boolean(getAgentPhoneConfig(runtime));
}

/** Send SMS/iMessage via AgentPhone POST /v1/messages */
export async function sendAgentPhoneMessage(
  params: { toNumber: string; body: string; runtime?: RuntimeEnv },
  config?: AgentPhoneConfig | null
): Promise<{ id?: string; status?: string; channel?: string; error?: string }> {
  const cfg = config || getAgentPhoneConfig(params.runtime);
  if (!cfg) return { error: 'AgentPhone is not configured (AGENTPHONE_API_KEY).' };

  const payload: Record<string, string> = {
    to_number: params.toNumber,
    body: params.body,
  };
  if (cfg.fromNumber) payload.from_number = cfg.fromNumber;
  else if (cfg.agentId) payload.agent_id = cfg.agentId;
  else return { error: 'Set AGENTPHONE_FROM_NUMBER or AGENTPHONE_AGENT_ID.' };

  try {
    const res = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof data?.message === 'string' ? data.message : JSON.stringify(data).slice(0, 300);
      return { error: `AgentPhone send failed (${res.status}): ${detail}` };
    }
    return {
      id: typeof data.id === 'string' ? data.id : undefined,
      status: typeof data.status === 'string' ? data.status : undefined,
      channel: typeof data.channel === 'string' ? data.channel : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'AgentPhone send failed.' };
  }
}

export type ParsedAgentPhoneInbound = {
  fromPhone: string;
  text: string;
  messageId: string;
  mediaUrl: string | null;
  channel: string;
  conversationId: string | null;
};

/** Parse AgentPhone agent.message webhook payload. */
export function parseAgentPhoneInbound(body: unknown): ParsedAgentPhoneInbound | null {
  const raw = body as Record<string, unknown>;
  if (raw?.event !== 'agent.message') return null;

  const channel = String(raw.channel || '');
  if (!['sms', 'mms', 'imessage'].includes(channel)) return null;

  const data = (raw.data || {}) as Record<string, unknown>;
  if (data.direction && data.direction !== 'inbound') return null;

  const fromPhone = String(data.from || data.senderIdentifier || '').trim();
  const text = String(data.message || '').trim();
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null;
  const messageId = typeof data.conversationId === 'string' ? data.conversationId : `ap-${Date.now()}`;

  if (!fromPhone) return null;
  if (!text && !mediaUrl) return null;

  return {
    fromPhone,
    text,
    messageId,
    mediaUrl,
    channel,
    conversationId: typeof data.conversationId === 'string' ? data.conversationId : null,
  };
}

/** Verify X-Webhook-Signature per AgentPhone docs. */
export function verifyAgentPhoneWebhook(
  rawBody: string,
  headers: Headers,
  secret: string
): boolean {
  if (!secret) return false;
  const signature = headers.get('X-Webhook-Signature') || headers.get('x-webhook-signature') || '';
  const timestamp = headers.get('X-Webhook-Timestamp') || headers.get('x-webhook-timestamp') || '';
  if (!signature || !timestamp) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signedString = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedString).digest('hex');
  const expectedHeader = `sha256=${expected}`;

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedHeader);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return signature === expectedHeader;
  }
}
