import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentMessage,
  AssistantTurn,
  Provider,
  ProviderEvent,
  ProviderRunOptions,
  StopReason,
  ToolCall,
  ToolSchema,
} from "../types";

// Models that support adaptive thinking + the effort parameter. Sending these
// fields to other models (e.g. Haiku 4.5) would 400, so we gate them.
const THINKING_MODELS = [/^claude-opus-4-(6|7|8)/, /^claude-sonnet-4-6/];
const supportsThinking = (model: string) =>
  THINKING_MODELS.some((re) => re.test(model));

function toAnthropicMessages(messages: AgentMessage[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.images?.length) {
        const blocks: any[] = m.images.map((im) => ({
          type: "image",
          source: { type: "base64", media_type: im.mediaType, data: im.data },
        }));
        if (m.content) blocks.push({ type: "text", text: m.content });
        out.push({ role: "user", content: blocks });
      } else {
        out.push({ role: "user", content: m.content });
      }
    } else if (m.role === "assistant") {
      // Replay the exact content blocks (incl. signed thinking) when we have
      // them — required for adaptive thinking across tool calls in one request.
      if (Array.isArray(m.providerRaw) && m.providerRaw.length) {
        out.push({ role: "assistant", content: m.providerRaw });
        continue;
      }
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments ?? {},
        });
      }
      out.push({
        role: "assistant",
        content: blocks.length ? blocks : m.content || "(no output)",
      });
    } else if (m.role === "tool") {
      const block: any = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content || "(empty result)",
      };
      if (m.isError) block.is_error = true;
      // Anthropic wants all tool_results for one assistant turn in a single
      // user message — coalesce consecutive tool messages.
      const last = out[out.length - 1];
      if (
        last &&
        last.role === "user" &&
        Array.isArray(last.content) &&
        last.content[0]?.type === "tool_result"
      ) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return out;
}

function toAnthropicTools(tools?: ToolSchema[]): any[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export class AnthropicProvider implements Provider {
  id = "anthropic" as const;

  async run(
    opts: ProviderRunOptions,
    onEvent: (e: ProviderEvent) => void,
  ): Promise<AssistantTurn> {
    const client = new Anthropic({
      apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });

    const params: any = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      messages: toAnthropicMessages(opts.messages),
    };
    if (opts.system) params.system = opts.system;
    const tools = toAnthropicTools(opts.tools);
    if (tools) params.tools = tools;
    if (supportsThinking(opts.model)) {
      params.thinking = { type: "adaptive" };
      params.output_config = { effort: opts.effort ?? "high" };
    }

    const stream = client.messages.stream(
      params,
      opts.signal ? { signal: opts.signal } : undefined,
    );

    for await (const ev of stream as any) {
      if (ev.type === "content_block_delta") {
        if (ev.delta?.type === "text_delta" && ev.delta.text) {
          onEvent({ type: "text_delta", text: ev.delta.text });
        } else if (ev.delta?.type === "thinking_delta" && ev.delta.thinking) {
          onEvent({ type: "thinking_delta", text: ev.delta.thinking });
        }
      }
    }

    const final: any = await stream.finalMessage();

    let content = "";
    let thinking = "";
    const toolCalls: ToolCall[] = [];
    for (const block of final.content ?? []) {
      if (block.type === "text") content += block.text;
      else if (block.type === "thinking") thinking += block.thinking ?? "";
      else if (block.type === "tool_use") {
        const call: ToolCall = {
          id: block.id,
          name: block.name,
          arguments: (block.input ?? {}) as Record<string, unknown>,
        };
        toolCalls.push(call);
        onEvent({ type: "tool_call", call });
      }
    }

    const stopReason: StopReason =
      final.stop_reason === "tool_use"
        ? "tool_use"
        : final.stop_reason === "max_tokens"
          ? "max_tokens"
          : "end";

    const usage = final.usage
      ? {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
        }
      : undefined;
    if (usage) onEvent({ type: "usage", ...usage });

    return {
      content,
      thinking: thinking || undefined,
      toolCalls,
      stopReason,
      providerRaw: final.content,
      usage,
    };
  }
}
