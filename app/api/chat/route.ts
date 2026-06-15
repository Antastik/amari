import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agent/loop";
import { PROVIDERS } from "@/lib/providers";
import type { AgentEvent, ProviderId } from "@/lib/types";

// Node runtime: the agent's file/shell tools use node:fs and node:child_process.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const providerId = body.providerId as ProviderId;
  const cfg = PROVIDERS[providerId];
  if (!cfg) {
    return new Response(
      JSON.stringify({ error: `Unknown provider: ${providerId}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Resolve base URL + key. Ollama's "envKey" is actually its base URL.
  let baseURL: string | undefined = body.baseURL;
  let apiKey: string | undefined;
  if (providerId === "ollama") {
    baseURL =
      baseURL || process.env.OLLAMA_BASE_URL || cfg.defaultBaseURL;
    apiKey = body.apiKey || "ollama";
  } else {
    baseURL = baseURL || cfg.defaultBaseURL;
    apiKey = body.apiKey || (cfg.envKey ? process.env[cfg.envKey] : undefined);
  }

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController,
    e: AgentEvent | { type: "end" },
  ) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          send(controller, e);
        } catch {
          /* controller closed */
        }
      };

      if (cfg.needsKey && !apiKey) {
        emit({
          type: "error",
          message: `No API key for ${cfg.label}. Add one in Settings (or set ${cfg.envKey}).`,
        });
        send(controller, { type: "end" });
        controller.close();
        return;
      }

      try {
        await runAgent(
          {
            providerId,
            model: body.model,
            apiKey,
            baseURL,
            system: body.system || "",
            messages: Array.isArray(body.messages) ? body.messages : [],
            enabledTools: Array.isArray(body.enabledTools)
              ? body.enabledTools
              : undefined,
            effort: body.effort,
            maxSteps: body.maxSteps,
            signal: req.signal,
          },
          emit,
        );
      } catch (err: any) {
        emit({ type: "error", message: err?.message || String(err) });
      } finally {
        send(controller, { type: "end" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
