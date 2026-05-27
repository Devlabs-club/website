const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function getOpenRouterChatModel() {
  return process.env.OPENROUTER_MODEL_CHAT || 'google/gemini-2.0-flash-001';
}

export function hasOpenRouterConfig() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function generateOpenRouterReply(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  history?: Array<{ role: string; content: string }>;
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const messages = [
    { role: 'system', content: params.systemPrompt },
    ...(params.history || []),
    { role: 'user', content: params.userPrompt },
  ];

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
    },
    body: JSON.stringify({
      model: getOpenRouterChatModel(),
      messages,
      temperature: params.temperature ?? 0.2,
      max_tokens: params.maxTokens ?? 220,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${details}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter returned empty response');
  }

  return content.trim();
}
