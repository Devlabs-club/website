const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Agent tool loops (search + shortlist CRUD) need headroom beyond a single reply. */
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 120000);

/**
 * Founder chat + agent turns. Luna is the cost/latency tier — never Sol.
 * Deployments can override via OPENROUTER_MODEL_CHAT.
 */
export function getOpenRouterChatModel() {
  const configured = process.env.OPENROUTER_MODEL_CHAT || 'openai/gpt-5.6-luna';
  if (/sol/i.test(configured)) {
    console.warn('[openrouter] refusing Sol model for chat; falling back to gpt-5.6-luna');
    return 'openai/gpt-5.6-luna';
  }
  return configured;
}

/**
 * Used for open-ended talent analysis, cohort reranking, and evidence synthesis.
 * Luna Pro = same Luna weights with pro reasoning. Never Sol.
 */
export function getOpenRouterReasoningModel() {
  const configured = process.env.OPENROUTER_MODEL_REASONING || 'openai/gpt-5.6-luna-pro';
  if (/sol/i.test(configured)) {
    console.warn('[openrouter] refusing Sol model for reasoning; falling back to gpt-5.6-luna-pro');
    return 'openai/gpt-5.6-luna-pro';
  }
  return configured;
}

export function hasOpenRouterConfig() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function getOpenRouterEmbeddingModel() {
  return process.env.OPENROUTER_MODEL_EMBEDDING || 'openai/text-embedding-3-small';
}

export function hasOpenRouterEmbeddingConfig() {
  return hasOpenRouterConfig();
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
  const startedAt = Date.now();
  const res = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
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
  const data = await res.json();
  const usage = (data as any)?.usage || {};
  console.info('[openrouter] chat completion ok', {
    model: body.model,
    durationMs: Date.now() - startedAt,
    hasTools: Array.isArray(body.tools),
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    costUsd: usage.cost ?? usage.total_cost ?? null,
  });
  return data;
}

// ── Simple reply (no tools) ──────────────────────────────────────────────────

export type OpenRouterFileAttachment = {
  filename: string;
  data: Buffer;
  mimeType?: string;
};

type OpenRouterUserContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'file';
      file: { filename: string; file_data: string };
    };

function toOpenRouterFilePart(file: OpenRouterFileAttachment): OpenRouterUserContentPart {
  const mime = file.mimeType || 'application/pdf';
  return {
    type: 'file',
    file: {
      filename: file.filename,
      file_data: `data:${mime};base64,${file.data.toString('base64')}`,
    },
  };
}

export async function generateOpenRouterReply(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  history?: Array<{ role: string; content: string }>;
  responseFormat?: 'json_object';
  model?: 'chat' | 'reasoning';
  /** When set, ask the provider to keep reasoning short so structured JSON is not truncated. */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  /**
   * Optional binary attachments (e.g. PDF). Used when text extractors fail on
   * design-tool / Figma exports that still have readable content for multimodal models.
   */
  files?: OpenRouterFileAttachment[];
}): Promise<string> {
  const userContent: string | OpenRouterUserContentPart[] =
    params.files && params.files.length > 0
      ? [...params.files.map(toOpenRouterFilePart), { type: 'text', text: params.userPrompt }]
      : params.userPrompt;

  const messages = [
    { role: 'system', content: params.systemPrompt },
    ...(params.history || []),
    { role: 'user', content: userContent },
  ];
  const body: Record<string, unknown> = {
    model: params.model === 'reasoning' ? getOpenRouterReasoningModel() : getOpenRouterChatModel(),
    messages,
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens ?? 400,
  };
  if (params.model === 'reasoning') {
    body.reasoning = { effort: 'medium' };
  } else if (params.reasoningEffort) {
    body.reasoning = { effort: params.reasoningEffort };
  }
  if (params.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  const data = await callOpenRouter(body);
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
  model?: 'chat' | 'reasoning';
}): Promise<OpenRouterAgentResponse> {
  const body: Record<string, unknown> = {
    model: params.model === 'reasoning' ? getOpenRouterReasoningModel() : getOpenRouterChatModel(),
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens ?? 1200,
  };
  if (params.model === 'reasoning') {
    body.reasoning = { effort: 'medium' };
  }
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

// ── Embeddings (OpenAI-compatible /embeddings route) ───────────────────────────

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

export async function generateOpenRouterEmbedding(
  text: string,
  dimensions = 1536
): Promise<number[] | null> {
  if (!hasOpenRouterEmbeddingConfig() || !text.trim()) return null;

  try {
    const res = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
      },
      body: JSON.stringify({
        model: getOpenRouterEmbeddingModel(),
        input: text.slice(0, 8000),
        dimensions,
        encoding_format: 'float',
      }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.warn('[openrouter] embeddings error:', res.status, details.slice(0, 300));
      return null;
    }

    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = data.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  } catch (err) {
    console.warn('[openrouter] generateOpenRouterEmbedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
