import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type ClaimMessageResult =
  | { status: 'sent'; providerMessageId?: string | null }
  | { status: 'not_configured' };

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
  const webhookUrl = readEnv('BUILDER_CLAIM_MESSAGE_WEBHOOK_URL', runtime);
  if (!webhookUrl) {
    console.warn('[builder-claim-message] delivery skipped: BUILDER_CLAIM_MESSAGE_WEBHOOK_URL is not configured');
    return { status: 'not_configured' };
  }

  const secret = readEnv('BUILDER_CLAIM_MESSAGE_WEBHOOK_SECRET', runtime);
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      channel: 'imessage',
      to: params.toPhone,
      body: params.body,
      claimId: params.claimId,
      builderId: params.builderId || null,
      purpose: params.purpose,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Claim message provider failed (${response.status}): ${detail || response.statusText}`);
  }

  const data = (await response.json().catch(() => ({}))) as { messageId?: string; id?: string };
  return { status: 'sent', providerMessageId: data.messageId || data.id || null };
}
