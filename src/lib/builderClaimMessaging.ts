import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type ClaimMessageResult =
  | { status: 'sent'; providerMessageId?: string | null }
  | { status: 'not_configured' }
  | { status: 'delivery_failed'; error: string };

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
    const blueBubblesResult = await sendViaBlueBubbles(params, runtime);
    if (blueBubblesResult.status === 'sent') return blueBubblesResult;
    if (blueBubblesResult.status === 'delivery_failed') return blueBubblesResult;
    const localResult = await sendViaLocalMacMessages(params);
    if (localResult.status === 'sent') return localResult;
    console.warn('[builder-claim-message] delivery skipped: BlueBubbles or BUILDER_CLAIM_MESSAGE_WEBHOOK_URL is not configured');
    return { status: 'not_configured' };
  }

  const secret = readEnv('BUILDER_CLAIM_MESSAGE_WEBHOOK_SECRET', runtime);
  try {
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
      return {
        status: 'delivery_failed',
        error: `Claim message provider failed (${response.status}): ${detail || response.statusText}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as { messageId?: string; id?: string };
    return { status: 'sent', providerMessageId: data.messageId || data.id || null };
  } catch (error) {
    return {
      status: 'delivery_failed',
      error: error instanceof Error ? error.message : 'Claim message provider failed.',
    };
  }
}

async function sendViaBlueBubbles(
  params: {
    toPhone: string;
    body: string;
    claimId: string;
  },
  runtime?: RuntimeEnv
): Promise<ClaimMessageResult> {
  const serverUrl = readEnv('BLUEBUBBLES_SERVER_URL', runtime)?.replace(/\/$/, '');
  const password = readEnv('BLUEBUBBLES_PASSWORD', runtime);
  if (!serverUrl || !password) return { status: 'not_configured' };

  try {
    const response = await fetch(`${serverUrl}/api/v1/message/text?password=${encodeURIComponent(password)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: `any;-;${params.toPhone}`,
        tempGuid: `devlabs-${params.claimId}-${Date.now()}`,
        message: params.body,
        method: 'private-api',
        subject: '',
        effectId: '',
        selectedMessageGuid: '',
        partIndex: 0,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        status: 'delivery_failed',
        error: `BlueBubbles send failed (${response.status}): ${detail || response.statusText}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as { data?: { guid?: string }; guid?: string };
    return { status: 'sent', providerMessageId: data.data?.guid || data.guid || null };
  } catch (error) {
    return {
      status: 'delivery_failed',
      error: error instanceof Error ? error.message : 'BlueBubbles send failed.',
    };
  }
}

async function sendViaLocalMacMessages(params: {
  toPhone: string;
  body: string;
  claimId: string;
}): Promise<ClaimMessageResult> {
  const isLocalDev =
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    process.platform === 'darwin';

  if (!isLocalDev) return { status: 'not_configured' };

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const script = `
      on run argv
        set targetPhone to item 1 of argv
        set messageBody to item 2 of argv
        tell application "Messages"
          set targetService to 1st service whose service type = iMessage
          set targetBuddy to buddy targetPhone of targetService
          send messageBody to targetBuddy
        end tell
      end run
    `;
    await execFileAsync('osascript', ['-e', script, params.toPhone, params.body], {
      timeout: 15000,
    });
    return { status: 'sent', providerMessageId: `local-messages:${params.claimId}:${Date.now()}` };
  } catch (error) {
    console.warn('[builder-claim-message] local Mac Messages delivery failed', error);
    return { status: 'not_configured' };
  }
}
