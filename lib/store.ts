import type { AgentEvent, AgentMessage, ProviderId } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Client-side state: settings + conversations (localStorage) and the SSE client.
// ─────────────────────────────────────────────────────────────────────────────

export type Effort = "low" | "medium" | "high" | "max";

export interface EnvInfo {
  local: boolean;
  workspace: string;
  providers: Record<string, { hasEnvKey: boolean }>;
  ollama: { reachable: boolean; models: string[]; baseURL: string };
}

export interface Settings {
  providerId: ProviderId;
  model: string;
  agentId: string;
  apiKeys: Partial<Record<ProviderId, string>>;
  baseURLs: Partial<Record<ProviderId, string>>;
  /** Tool names the user has turned OFF (applied on top of preset defaults). */
  disabledTools: string[];
  effort: Effort;
}

/** Stored message = normalized AgentMessage plus UI-only bookkeeping fields. */
export type StoredMessage = AgentMessage & {
  _id?: string;
  /** UI-only note (error / info) — not sent back to the model. */
  _note?: "error" | "info";
};

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentId: string;
  providerId: ProviderId;
  model: string;
  messages: StoredMessage[];
  usage?: { inputTokens: number; outputTokens: number };
}

export const DEFAULT_SETTINGS: Settings = {
  providerId: "anthropic",
  model: "claude-opus-4-8",
  agentId: "build",
  apiKeys: {},
  baseURLs: {},
  disabledTools: [],
  effort: "high",
};

const SKEY_SETTINGS = "amari.settings.v1";
const SKEY_CONVOS = "amari.conversations.v1";

export function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SKEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SKEY_SETTINGS, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SKEY_CONVOS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(SKEY_CONVOS, JSON.stringify(convos));
  } catch {
    /* quota exceeded — drop oldest */
    try {
      localStorage.setItem(
        SKEY_CONVOS,
        JSON.stringify(convos.slice(0, 20)),
      );
    } catch {
      /* give up */
    }
  }
}

/**
 * Read an image File, downscale to a max edge (default 1536px) and re-encode to
 * JPEG to keep payloads + localStorage small. Falls back to the raw bytes for
 * formats canvas can't handle (e.g. SVG). Returns base64 (no data: prefix).
 */
export async function fileToImagePart(
  file: File,
  maxEdge = 1536,
): Promise<{ mediaType: string; data: string; previewUrl: string }> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    return { mediaType: "image/jpeg", data: out.split(",")[1] ?? "", previewUrl: out };
  } catch {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    return {
      mediaType: m?.[1] || file.type || "image/png",
      data: m?.[2] || "",
      previewUrl: dataUrl,
    };
  }
}

export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return (t.length > 42 ? t.slice(0, 42) + "…" : t) || "new session";
}

export interface ChatRequest {
  providerId: ProviderId;
  model: string;
  apiKey?: string;
  baseURL?: string;
  system: string;
  messages: AgentMessage[];
  enabledTools?: string[];
  effort?: Effort;
  maxSteps?: number;
}

export type StreamEvent = AgentEvent | { type: "end" };

/** POST to /api/chat and parse the SSE stream, invoking onEvent per event. */
export async function streamChat(
  req: ChatRequest,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      onEvent({ type: "end" });
      return;
    }
    onEvent({ type: "error", message: e?.message || "network error" });
    onEvent({ type: "end" });
    return;
  }

  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: `Request failed (HTTP ${res.status})` });
    onEvent({ type: "end" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        try {
          onEvent(JSON.parse(json) as StreamEvent);
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      onEvent({ type: "error", message: e?.message || "stream error" });
    }
  }
  onEvent({ type: "end" });
}

/** Strip UI-only fields before sending history back to the model. */
export function toWireMessages(messages: StoredMessage[]): AgentMessage[] {
  return messages
    .filter((m) => !m._note)
    .map(({ _id, _note, ...rest }) => rest);
}
