const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function getOpenRouterChatModel() {
  return process.env.OPENROUTER_MODEL_CHAT || 'google/gemini-2.5-flash';
}

export function hasOpenRouterConfig() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type OpenRouterAgentResponse = {
  content: string | null;
  tool_calls?: ToolCall[];
};

// ── Core fetch ───────────────────────────────────────────────────────────────

async function callOpenRouter(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
  const res = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const details = await res.text();
    throw new Error(`OpenRouter request failed (${res.status}): ${details}`);
  }
  return res.json();
}

// ── Simple reply (no tools) ──────────────────────────────────────────────────

export async function generateOpenRouterReply(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  history?: Array<{ role: string; content: string }>;
}): Promise<string> {
  const messages = [
    { role: 'system', content: params.systemPrompt },
    ...(params.history || []),
    { role: 'user', content: params.userPrompt },
  ];
  const data = await callOpenRouter({
    model: getOpenRouterChatModel(),
    messages,
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens ?? 400,
  });
  const content = (data as any)?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') throw new Error('OpenRouter returned empty response');
  return content.trim();
}

// ── Agent reply with tool calling ────────────────────────────────────────────

export async function generateOpenRouterAgentTurn(params: {
  messages: AgentMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}): Promise<OpenRouterAgentResponse> {
  const body: Record<string, unknown> = {
    model: getOpenRouterChatModel(),
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens ?? 600,
  };
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = 'auto';
  }
  const data = await callOpenRouter(body) as any;
  const choice = data?.choices?.[0];
  const msg = choice?.message;
  return {
    content: msg?.content ?? null,
    tool_calls: msg?.tool_calls ?? undefined,
  };
}
