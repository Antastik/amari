import OpenAI from "openai";
import type {
  AgentMessage,
  AssistantTurn,
  Provider,
  ProviderEvent,
  ProviderId,
  ProviderRunOptions,
  StopReason,
  ToolCall,
  ToolSchema,
} from "../types";

// Providers known to honor OpenAI's streaming usage option. Others may reject
// the unknown field, so we leave it off for them.
const USAGE_OK: ProviderId[] = ["openai", "openrouter", "moonshot"];

function toOpenAIMessages(messages: AgentMessage[], system?: string): any[] {
  const out: any[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "user") {
      if (m.images?.length) {
        const parts: any[] = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const im of m.images) {
          parts.push({
            type: "image_url",
            image_url: { url: `data:${im.mediaType};base64,${im.data}` },
          });
        }
        out.push({ role: "user", content: parts });
      } else {
        out.push({ role: "user", content: m.content });
      }
    } else if (m.role === "assistant") {
      const msg: any = { role: "assistant", content: m.content || "" };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        }));
        if (!m.content) msg.content = null;
      }
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content || "(empty result)",
      });
    }
  }
  return out;
}

function toOpenAITools(tools?: ToolSchema[]): any[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export class OpenAICompatProvider implements Provider {
  id: ProviderId;
  constructor(id: ProviderId) {
    this.id = id;
  }

  async run(
    opts: ProviderRunOptions,
    onEvent: (e: ProviderEvent) => void,
  ): Promise<AssistantTurn> {
    const client = new OpenAI({
      apiKey: opts.apiKey || "none",
      baseURL: opts.baseURL,
    });

    const body: any = {
      model: opts.model,
      messages: toOpenAIMessages(opts.messages, opts.system),
      stream: true,
    };
    if (USAGE_OK.includes(this.id)) {
      body.stream_options = { include_usage: true };
    }
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;
    const tools = toOpenAITools(opts.tools);
    if (tools) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const stream: any = await client.chat.completions.create(
      body,
      opts.signal ? { signal: opts.signal } : undefined,
    );

    let content = "";
    const toolAcc = new Map<
      number,
      { id: string; name: string; args: string }
    >();
    let finishReason: string | null = null;
    let usage: any = null;

    for await (const chunk of stream) {
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) {
        content += delta.content;
        onEvent({ type: "text_delta", text: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tcd of delta.tool_calls) {
          const idx = tcd.index ?? 0;
          const cur = toolAcc.get(idx) ?? { id: "", name: "", args: "" };
          if (tcd.id) cur.id = tcd.id;
          if (tcd.function?.name) cur.name = tcd.function.name;
          if (tcd.function?.arguments) cur.args += tcd.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const toolCalls: ToolCall[] = [];
    for (const [, t] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
      if (!t.name) continue;
      let args: Record<string, unknown> = {};
      try {
        args = t.args ? JSON.parse(t.args) : {};
      } catch {
        args = { _raw: t.args };
      }
      const id = t.id || `call_${Math.random().toString(36).slice(2, 10)}`;
      const call: ToolCall = { id, name: t.name, arguments: args };
      toolCalls.push(call);
      onEvent({ type: "tool_call", call });
    }

    const stopReason: StopReason =
      toolCalls.length || finishReason === "tool_calls"
        ? "tool_use"
        : finishReason === "length"
          ? "max_tokens"
          : "end";

    const u = usage
      ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
      : undefined;
    if (u) onEvent({ type: "usage", ...u });

    return { content, toolCalls, stopReason, usage: u };
  }
}
