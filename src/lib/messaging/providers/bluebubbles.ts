import type { MessageProvider, NormalizedInbound } from '../types';
import { normalizeHandle } from '../types';

/**
 * BlueBubbles provider — talks to a BlueBubbles Server app running on a Mac
 * that is signed into iMessage. Used for the pilot. Both the BlueBubbles server
 * and this app run on the same Mac, so no tunnel is required:
 *   - inbound:  BlueBubbles webhook  ->  http://localhost:4321/api/imessage/webhook?secret=...
 *   - outbound: this app             ->  http://localhost:1234/api/v1/...
 *
 * Docs: https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks
 */
function serverUrl() {
  return (process.env.BLUEBUBBLES_SERVER_URL || 'http://localhost:1234').replace(/\/$/, '');
}
function password() {
  return process.env.BLUEBUBBLES_PASSWORD || '';
}
function webhookSecret() {
  return process.env.BLUEBUBBLES_WEBHOOK_SECRET || '';
}
// 'apple-script' works without the Private API helper; 'private-api' adds tapbacks/typing
// but needs helper_connected:true. Default to the reliable one.
function sendMethod() {
  return process.env.BLUEBUBBLES_SEND_METHOD || 'apple-script';
}

/** Deterministic 1:1 chat guid for an iMessage handle. */
function chatGuidFor(handle: string): string {
  return `iMessage;-;${handle}`;
}

export const bluebubblesProvider: MessageProvider = {
  name: 'bluebubbles',

  async send(to, body) {
    const guid = to.chatGuid || chatGuidFor(to.handle);
    const url = `${serverUrl()}/api/v1/message/text?password=${encodeURIComponent(password())}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: guid,
        tempGuid: `devlabs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message: body,
        method: sendMethod(),
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`[bluebubbles] send failed ${res.status}: ${txt}`);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    return { guid: data?.data?.guid };
  },

  async setTyping(to) {
    const guid = to.chatGuid || chatGuidFor(to.handle);
    try {
      await fetch(
        `${serverUrl()}/api/v1/chat/${encodeURIComponent(guid)}/typing?password=${encodeURIComponent(password())}`,
        { method: 'POST' }
      );
    } catch {
      /* typing is best-effort */
    }
  },

  parseInbound(rawBody) {
    const body = rawBody as any;
    // BlueBubbles posts { type: "new-message", data: { ...message } }
    if (!body || body.type !== 'new-message' || !body.data) return null;
    const m = body.data;
    if (m.isFromMe) return null; // ignore our own echoes
    const text: string = (m.text || '').trim();
    if (!text) return null; // skip attachment-only / reactions for pilot

    const chat = Array.isArray(m.chats) && m.chats.length ? m.chats[0] : null;
    const rawAddress: string = m.handle?.address || chat?.chatIdentifier || '';
    if (!rawAddress) return null;

    const out: NormalizedInbound = {
      providerMessageGuid: m.guid,
      handle: normalizeHandle(rawAddress),
      rawAddress,
      chatGuid: chat?.guid || null,
      text,
      service: (chat?.guid || '').startsWith('SMS') ? 'SMS' : 'iMessage',
      isFromMe: false,
      receivedAt: m.dateCreated ? new Date(m.dateCreated) : new Date(),
      attachments: Array.isArray(m.attachments)
        ? m.attachments.map((a: any) => ({ name: a.transferName, mimeType: a.mimeType }))
        : [],
    };
    return out;
  },

  verifyInbound({ searchParams }) {
    const expected = webhookSecret();
    if (!expected) return true; // pilot: secret optional on localhost
    return searchParams.get('secret') === expected;
  },
};
