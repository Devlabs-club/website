import type { MessageProvider, NormalizedInbound } from '../types';
import { normalizeHandle } from '../types';
import { parseAgentPhoneInbound, getAgentPhoneConfig, verifyAgentPhoneWebhook, sendAgentPhoneMessage } from '../agentPhoneClient';

/**
 * AgentPhone provider — SMS/MMS/iMessage via api.agentphone.ai
 * @see https://docs.agentphone.ai/documentation/guides/messages
 */
export const agentPhoneProvider: MessageProvider = {
  name: 'agentphone',

  async send(to, body) {
    const result = await sendAgentPhoneMessage({ toNumber: to.handle, body });
    if (result.error) throw new Error(result.error);
    return { guid: result.id };
  },

  parseInbound(rawBody) {
    const parsed = parseAgentPhoneInbound(rawBody);
    if (!parsed) return null;

    const out: NormalizedInbound = {
      providerMessageGuid: parsed.messageId,
      handle: normalizeHandle(parsed.fromPhone),
      rawAddress: parsed.fromPhone,
      chatGuid: parsed.conversationId,
      text: parsed.text || '(attachment)',
      service: parsed.channel === 'sms' || parsed.channel === 'mms' ? 'SMS' : 'iMessage',
      isFromMe: false,
      receivedAt: new Date(),
      attachments: parsed.mediaUrl ? [{ url: parsed.mediaUrl }] : [],
    };
    return out;
  },

  verifyInbound({ headers, rawBody }) {
    const config = getAgentPhoneConfig();
    if (!config?.webhookSecret) return true;
    return verifyAgentPhoneWebhook(
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
      headers,
      config.webhookSecret
    );
  },
};
