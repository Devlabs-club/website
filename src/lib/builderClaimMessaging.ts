import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import { sendAgentPhoneMessage, hasAgentPhoneConfig } from '@/lib/messaging/agentPhoneClient';

export type ClaimMessageResult =
  | { status: 'sent'; providerMessageId?: string | null }
  | { status: 'not_configured' }
  | { status: 'delivery_failed'; error: string };

/**
 * Outbound builder messages via AgentPhone (SMS/iMessage).
 * @see https://docs.agentphone.ai/documentation/guides/messages
 */
export async function sendBuilderClaimMessage(
  params: {
    toPhone: string;
    body: string;
    claimId: string;
    builderId?: string | null;
    purpose: 'phone_verification' | 'claim_conversation';
  },
  runtime?: RuntimeEnv
): Promise<ClaimMessageResult> {
  if (!hasAgentPhoneConfig(runtime)) {
    console.warn('[builder-claim-message] AgentPhone not configured (AGENTPHONE_API_KEY)');
    return { status: 'not_configured' };
  }

  const result = await sendAgentPhoneMessage(
    { toNumber: params.toPhone, body: params.body, runtime }
  );

  if (result.error) {
    return { status: 'delivery_failed', error: result.error };
  }

  return { status: 'sent', providerMessageId: result.id || null };
}
