import type { MessageProvider, NormalizedInbound } from '../types';
import { normalizeHandle } from '../types';
import { getBlueBubblesConfig, sendBlueBubblesMessage } from '../bluebubblesClient';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

/**
 * BlueBubbles provider — talks to a BlueBubbles Server app running on a Mac
 * signed into iMessage.
 *
 * Docs: https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks
 */
export const bluebubblesProvider: MessageProvider = {
  name: 'bluebubbles',

  async send(to, body) {
    const result = await sendBlueBubblesMessage({
      toPhone: to.handle,
      body,
      chatGuid: to.chatGuid,
    });
    if (result.error) throw new Error(result.error);
    return { guid: result.guid };
  },

  async setTyping(to) {
    const config = getBlueBubblesConfig();
    if (!config) return;
    const guid = to.chatGuid || `iMessage;-;${to.handle}`;
    try {
      await fetch(
        `${config.serverUrl}/api/v1/chat/${encodeURIComponent(guid)}/typing?password=${encodeURIComponent(config.password)}`,
        { method: 'POST' }
      );
    } catch {
      /* typing is best-effort */
    }
  },

  parseInbound(rawBody) {
    const body = rawBody as any;
    if (!body || body.type !== 'new-message' || !body.data) return null;
    const m = body.data;
    if (m.isFromMe || m.isFromMeString === '1') return null;

    const text: string = (m.text || '').trim();
    const hasAttachments = Array.isArray(m.attachments) && m.attachments.length > 0;
    if (!text && !hasAttachments) return null;

    const chat = Array.isArray(m.chats) && m.chats.length ? m.chats[0] : null;
    const rawAddress: string = m.handle?.address || chat?.chatIdentifier || '';
    if (!rawAddress) return null;

    const out: NormalizedInbound = {
      providerMessageGuid: m.guid,
      handle: normalizeHandle(rawAddress),
      rawAddress,
      chatGuid: chat?.guid || null,
      text: text || '(attachment)',
      service: (chat?.guid || '').startsWith('SMS') ? 'SMS' : 'iMessage',
      isFromMe: false,
      receivedAt: m.dateCreated ? new Date(m.dateCreated) : new Date(),
      attachments: hasAttachments
        ? m.attachments.map((a: any) => ({ name: a.transferName, mimeType: a.mimeType }))
        : [],
    };
    return out;
  },

  verifyInbound({ searchParams, headers }) {
    const runtime = undefined as RuntimeEnv | undefined;
    const expectedSecret = readEnv('BUILDER_CLAIM_INBOUND_WEBHOOK_SECRET', runtime);
    const blueBubblesSecret = getBlueBubblesConfig(runtime)?.webhookSecret;
    const blueBubblesPassword = getBlueBubblesConfig(runtime)?.password;
    const querySecret = searchParams.get('secret') || searchParams.get('password');
    const auth = headers.get('Authorization') || '';

    if (expectedSecret || blueBubblesSecret || blueBubblesPassword) {
      return (
        (expectedSecret && (auth === `Bearer ${expectedSecret}` || querySecret === expectedSecret)) ||
        (blueBubblesSecret && querySecret === blueBubblesSecret) ||
        (blueBubblesPassword && querySecret === blueBubblesPassword) ||
        false
      );
    }
    return true;
  },
};
