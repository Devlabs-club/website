import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import { sendAgentPhoneMessage, hasAgentPhoneConfig } from '@/lib/messaging/agentPhoneClient';
import { sendBlueBubblesMessage, hasBlueBubblesConfig } from '@/lib/messaging/bluebubblesClient';
import { getImessageProviderName } from '@/lib/messaging/getProvider';

export type ClaimMessageResult =
  | { status: 'sent'; providerMessageId?: string | null }
  | { status: 'not_configured' }
  | { status: 'delivery_failed'; error: string };

/**
 * Outbound builder messages via the configured iMessage provider (BlueBubbles or AgentPhone).
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
  const provider = getImessageProviderName(runtime);

  if (provider === 'bluebubbles') {
    if (!hasBlueBubblesConfig(runtime)) {
      console.warn('[builder-claim-message] BlueBubbles not configured (BLUEBUBBLES_SERVER_URL / BLUEBUBBLES_PASSWORD)');
      return { status: 'not_configured' };
    }
    const result = await sendBlueBubblesMessage(
      { toPhone: params.toPhone, body: params.body, tempGuid: `devlabs-${params.claimId}-${Date.now()}` },
      runtime
    );
    if (result.error) {
      console.warn('[builder-claim-message] BlueBubbles delivery failed', {
        claimId: params.claimId,
        toPhone: params.toPhone,
        purpose: params.purpose,
        error: result.error,
      });
      return { status: 'delivery_failed', error: result.error };
    }
    return { status: 'sent', providerMessageId: result.guid || null };
  }

  if (!hasAgentPhoneConfig(runtime)) {
    console.warn('[builder-claim-message] AgentPhone not configured (AGENTPHONE_API_KEY)');
    return { status: 'not_configured' };
  }

  const result = await sendAgentPhoneMessage({ toNumber: params.toPhone, body: params.body, runtime });
  if (result.error) return { status: 'delivery_failed', error: result.error };
  return { status: 'sent', providerMessageId: result.id || null };
}
