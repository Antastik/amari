// ─────────────────────────────────────────────────────────────────────────────
// Shared types for Amari's provider + agent layer.
//
// Internally we keep one normalized message/tool representation. Each provider
// translates it to/from its own wire format right before the API call, so the
// rest of the app (agent loop, UI, persistence) never deals with vendor shapes.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "moonshot"
  | "openrouter"
  | "ollama";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** An inline image (base64, no data: prefix) for vision-capable models. */
export interface ImagePart {
  mediaType: string;
  data: string;
}

/** A normalized conversation message. */
export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;

  /** user-only: images sent to a multimodal model. */
  images?: ImagePart[];

  // assistant-only
  toolCalls?: ToolCall[];
  thinking?: string;
  /**
   * Exact provider-native content (e.g. Anthropic content blocks incl. signed
   * thinking blocks) so a turn can be replayed faithfully within a request.
   * Opaque to everything except the provider that produced it.
   */
  providerRaw?: unknown;

  // tool-only
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

/** Provider-agnostic tool definition (JSON-schema parameters). */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Events streamed by a provider during a single assistant turn. */
export type ProviderEvent =
  | { type: "thinking_delta"; text: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; inputTokens?: number; outputTokens?: number };

export type StopReason = "end" | "tool_use" | "max_tokens" | "error";

/** Result of one completed assistant turn. */
export interface AssistantTurn {
  content: string;
  thinking?: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  providerRaw?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ProviderRunOptions {
  model: string;
  system?: string;
  messages: AgentMessage[];
  tools?: ToolSchema[];
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  temperature?: number;
  effort?: "low" | "medium" | "high" | "max";
  signal?: AbortSignal;
}

export interface Provider {
  id: ProviderId;
  run(
    opts: ProviderRunOptions,
    onEvent: (e: ProviderEvent) => void,
  ): Promise<AssistantTurn>;
}

/** Events the agent loop emits over SSE to the browser. */
export type AgentEvent =
  | { type: "turn"; index: number }
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | {
      type: "tool_result";
      id: string;
      name: string;
      content: string;
      isError?: boolean;
    }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "done"; stopReason: StopReason }
  | { type: "error"; message: string };
