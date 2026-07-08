import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

export type BlueBubblesConfig = {
  serverUrl: string;
  password: string;
  webhookSecret: string | null;
  sendMethod: string;
};

export function blueBubblesServerCandidates(runtime?: RuntimeEnv): string[] {
  const values = [
    readEnv('BLUEBUBBLES_SERVER_URL', runtime),
    readEnv('BLUEBUBBLES_SERVER_URL_FALLBACK', runtime),
    process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:1234' : null,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.replace(/\/$/, '') || '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function safeHost(serverUrl: string) {
  try {
    return new URL(serverUrl).hostname;
  } catch {
    return serverUrl;
  }
}

export function getBlueBubblesConfig(runtime?: RuntimeEnv): BlueBubblesConfig | null {
  const serverUrl = readEnv('BLUEBUBBLES_SERVER_URL', runtime)?.replace(/\/$/, '');
  const password = readEnv('BLUEBUBBLES_PASSWORD', runtime);
  if (!serverUrl || !password) return null;
  return {
    serverUrl,
    password,
    webhookSecret: readEnv('BLUEBUBBLES_WEBHOOK_SECRET', runtime) || null,
    sendMethod: readEnv('BLUEBUBBLES_SEND_METHOD', runtime) || 'apple-script',
  };
}

export function hasBlueBubblesConfig(runtime?: RuntimeEnv) {
  const password = readEnv('BLUEBUBBLES_PASSWORD', runtime);
  return Boolean(password && blueBubblesServerCandidates(runtime).length);
}

function isMissingChatError(detail: string) {
  return detail.toLowerCase().includes('chat does not exist');
}

async function sendBlueBubblesMessageWithConfig(
  config: BlueBubblesConfig,
  params: { toPhone: string; body: string; chatGuid?: string | null; tempGuid?: string }
): Promise<{ guid?: string; error?: string }> {
  const tempGuid = params.tempGuid || `devlabs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const chatGuid = params.chatGuid || `iMessage;-;${params.toPhone}`;

  try {
    const response = await fetch(
      `${config.serverUrl}/api/v1/message/text?password=${encodeURIComponent(config.password)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatGuid,
          tempGuid,
          message: params.body,
          method: config.sendMethod,
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (isMissingChatError(detail)) {
        return createBlueBubblesChat({
          config,
          toPhone: params.toPhone,
          body: params.body,
          tempGuid,
        });
      }
      return {
        error: `BlueBubbles send failed (${response.status}) via ${safeHost(config.serverUrl)}: ${detail || response.statusText}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as { data?: { guid?: string }; guid?: string };
    return { guid: data.data?.guid || data.guid };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BlueBubbles send failed.';
    return { error: `${message} (via ${safeHost(config.serverUrl)})` };
  }
}

/** Send a text message via BlueBubbles REST API, creating the chat if needed. */
export async function sendBlueBubblesMessage(
  params: { toPhone: string; body: string; chatGuid?: string | null; tempGuid?: string },
  runtime?: RuntimeEnv
): Promise<{ guid?: string; error?: string }> {
  const password = readEnv('BLUEBUBBLES_PASSWORD', runtime);
  const servers = blueBubblesServerCandidates(runtime);
  if (!password) {
    return { error: 'BlueBubbles is not configured (BLUEBUBBLES_PASSWORD missing).' };
  }
  if (!servers.length) {
    return { error: 'BlueBubbles is not configured (BLUEBUBBLES_SERVER_URL missing).' };
  }

  const sendMethod = readEnv('BLUEBUBBLES_SEND_METHOD', runtime) || 'apple-script';
  const webhookSecret = readEnv('BLUEBUBBLES_WEBHOOK_SECRET', runtime) || null;

  let lastError = 'BlueBubbles send failed.';
  for (const serverUrl of servers) {
    const result = await sendBlueBubblesMessageWithConfig(
      { serverUrl, password, webhookSecret, sendMethod },
      params
    );
    if (!result.error) return result;
    lastError = result.error;
    console.warn('[bluebubbles] outbound send failed', {
      host: safeHost(serverUrl),
      toPhone: params.toPhone,
      error: result.error,
    });
  }

  return { error: lastError };
}

async function createBlueBubblesChat(params: {
  config: BlueBubblesConfig;
  toPhone: string;
  body: string;
  tempGuid: string;
}): Promise<{ guid?: string; error?: string }> {
  const response = await fetch(
    `${params.config.serverUrl}/api/v1/chat/new?password=${encodeURIComponent(params.config.password)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addresses: [params.toPhone],
        message: params.body,
        method: params.config.sendMethod,
        service: 'iMessage',
        tempGuid: params.tempGuid,
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return {
      error: `BlueBubbles chat creation failed (${response.status}) via ${safeHost(params.config.serverUrl)}: ${detail || response.statusText}`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as {
    data?: {
      guid?: string;
      messages?: Array<{ guid?: string; tempGuid?: string }>;
    };
  };
  const sentMessage =
    data.data?.messages?.find((message) => message.tempGuid === params.tempGuid) || data.data?.messages?.[0];
  return { guid: sentMessage?.guid || data.data?.guid };
}
