import type { AgentEvent, AgentMessage, ProviderId } from "../types";
import { getProvider, PROVIDERS } from "../providers";
import {
  getWorkspace,
  localToolsEnabled,
  selectTools,
  type ToolRuntime,
} from "./tools";

export interface RunAgentParams {
  providerId: ProviderId;
  model: string;
  apiKey?: string;
  baseURL?: string;
  /** Agent preset system prompt. */
  system: string;
  /** Full conversation so far, ending with the new user message. */
  messages: AgentMessage[];
  /** Tool names the user has enabled; undefined = all available. */
  enabledTools?: string[];
  maxSteps?: number;
  effort?: "low" | "medium" | "high" | "max";
  signal?: AbortSignal;
}

function buildSystem(
  presetSystem: string,
  tools: ToolRuntime[],
  workspace: string,
  allowLocal: boolean,
): string {
  const lines: string[] = [presetSystem.trim(), ""];
  lines.push("── ENVIRONMENT ──");
  if (tools.length) {
    lines.push(
      `You have these tools: ${tools.map((t) => t.name).join(", ")}.`,
    );
    if (allowLocal) {
      lines.push(
        `File and shell tools operate inside the workspace directory: ${workspace}. Use paths relative to it.`,
      );
    } else {
      lines.push(
        "Filesystem and shell tools are unavailable in this (hosted) environment; only web tools are active.",
      );
    }
    lines.push(
      "Call tools when they help; otherwise answer directly. After tool results, continue until the task is done.",
    );
  } else {
    lines.push("No tools are available in this mode.");
  }
  return lines.join("\n");
}

export async function runAgent(
  p: RunAgentParams,
  emit: (e: AgentEvent) => void,
): Promise<void> {
  const cfg = PROVIDERS[p.providerId];
  if (!cfg) {
    emit({ type: "error", message: `Unknown provider: ${p.providerId}` });
    return;
  }
  const provider = getProvider(p.providerId);
  const baseURL = p.baseURL || cfg.defaultBaseURL;
  const allowLocal = localToolsEnabled();
  const tools = selectTools(allowLocal, p.enabledTools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const workspace = getWorkspace();
  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
  const system = buildSystem(p.system, tools, workspace, allowLocal);
  const messages: AgentMessage[] = [...p.messages];
  const maxSteps = p.maxSteps ?? 24;

  for (let step = 0; step < maxSteps; step++) {
    if (p.signal?.aborted) {
      emit({ type: "done", stopReason: "end" });
      return;
    }
    emit({ type: "turn", index: step });

    let turn;
    try {
      turn = await provider.run(
        {
          model: p.model,
          system,
          messages,
          tools: toolSchemas.length ? toolSchemas : undefined,
          apiKey: p.apiKey,
          baseURL,
          effort: p.effort,
          signal: p.signal,
        },
        (e) => {
          if (e.type === "text_delta") emit({ type: "text", delta: e.text });
          else if (e.type === "thinking_delta")
            emit({ type: "thinking", delta: e.text });
          else if (e.type === "tool_call")
            emit({
              type: "tool_call",
              id: e.call.id,
              name: e.call.name,
              arguments: e.call.arguments,
            });
          else if (e.type === "usage")
            emit({
              type: "usage",
              inputTokens: e.inputTokens,
              outputTokens: e.outputTokens,
            });
        },
      );
    } catch (err: any) {
      emit({ type: "error", message: err?.message || String(err) });
      return;
    }

    messages.push({
      role: "assistant",
      content: turn.content,
      toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined,
      thinking: turn.thinking,
      providerRaw: turn.providerRaw,
    });

    if (turn.stopReason !== "tool_use" || !turn.toolCalls.length) {
      emit({ type: "done", stopReason: turn.stopReason });
      return;
    }

    for (const call of turn.toolCalls) {
      if (p.signal?.aborted) {
        emit({ type: "done", stopReason: "end" });
        return;
      }
      const tool = toolMap.get(call.name);
      let result: { content: string; isError?: boolean };
      if (!tool) {
        result = {
          content: `Unknown or disabled tool: ${call.name}`,
          isError: true,
        };
      } else {
        try {
          result = await tool.run(call.arguments, { workspace });
        } catch (e: any) {
          result = { content: `Tool error: ${e?.message || e}`, isError: true };
        }
      }
      emit({
        type: "tool_result",
        id: call.id,
        name: call.name,
        content: result.content,
        isError: result.isError,
      });
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        content: result.content,
        isError: result.isError,
      });
    }
  }

  emit({
    type: "error",
    message: `Reached the maximum of ${maxSteps} agent steps.`,
  });
}
