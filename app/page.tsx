"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, PROVIDER_ORDER } from "@/lib/catalog";
import { AGENT_PRESETS, getPreset } from "@/lib/agent/prompts";
import { MessageView } from "@/components/Message";
import { SettingsModal } from "@/components/Settings";
import { FileViewer } from "@/components/FileViewer";
import { estimateCostUSD, fmtTokens } from "@/lib/pricing";
import {
  DEFAULT_SETTINGS,
  loadConversations,
  loadSettings,
  saveConversations,
  saveSettings,
  streamChat,
  titleFrom,
  toWireMessages,
  uid,
  type Conversation,
  type EnvInfo,
  type Settings,
  type StoredMessage,
} from "@/lib/store";
import type { ProviderId } from "@/lib/types";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const [attachments, setAttachments] = useState<
    { path: string; name: string; file: File }[]
  >([]);
  const [viewerFile, setViewerFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);

  const currentConv = useMemo(
    () => convos.find((c) => c.id === currentId) ?? null,
    [convos, currentId],
  );
  const providerCfg = PROVIDERS[settings.providerId];

  // ── load + persist ──────────────────────────────────────────────────────
  useEffect(() => {
    setSettings(loadSettings());
    const c = loadConversations();
    setConvos(c);
    setCurrentId(c[0]?.id ?? null);
    setMounted(true);
    refreshEnv();
  }, []);

  useEffect(() => {
    if (mounted) saveSettings(settings);
  }, [settings, mounted]);
  useEffect(() => {
    if (mounted) saveConversations(convos);
  }, [convos, mounted]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentConv?.messages, streaming]);

  const refreshEnv = useCallback(() => {
    fetch("/api/env")
      .then((r) => r.json())
      .then((data: EnvInfo) => {
        setEnv(data);
      })
      .catch(() => {});
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );

  const selectProvider = useCallback(
    (id: ProviderId) => {
      const cfg = PROVIDERS[id];
      let model = cfg.models[0]?.id ?? "";
      if (id === "ollama" && env?.ollama.models?.length) {
        model = env.ollama.models[0];
      }
      update({ providerId: id, model });
    },
    [env, update],
  );

  const newChat = useCallback(() => {
    setCurrentId(null);
    setInput("");
  }, []);

  const deleteChat = useCallback(
    (id: string) => {
      setConvos((prev) => prev.filter((c) => c.id !== id));
      setCurrentId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onAttach = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.path) {
          setAttachments((prev) => [
            ...prev,
            { path: data.path, name: data.name, file },
          ]);
        }
      }
    } finally {
      setUploading(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }, []);

  // ── send ────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || streaming) return;

    const preset = getPreset(settings.agentId);
    const atts = attachments;
    const attachNote = atts.length
      ? `\n\n[Attached files in the workspace: ${atts
          .map((a) => a.path)
          .join(", ")} — read them with the read_document tool.]`
      : "";
    const priorMessages: StoredMessage[] = currentConv
      ? currentConv.messages
      : [];
    const userMsg: StoredMessage = {
      _id: uid(),
      role: "user",
      content: (text || "(see attached files)") + attachNote,
    };

    let convId = currentId;
    if (!currentConv) {
      convId = uid();
      const conv: Conversation = {
        id: convId,
        title: titleFrom(text),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentId: settings.agentId,
        providerId: settings.providerId,
        model: settings.model,
        messages: [userMsg],
      };
      setConvos((prev) => [conv, ...prev]);
      setCurrentId(convId);
    }

    setInput("");
    setAttachments([]);
    setStreaming(true);
    setStatus("connecting…");

    const live: StoredMessage[] = [];
    let current: StoredMessage | null = null;
    const cid = convId!;
    const priorUsage = currentConv?.usage ?? { inputTokens: 0, outputTokens: 0 };
    const usageAcc = { inputTokens: 0, outputTokens: 0 };

    const commit = () => {
      setConvos((prev) =>
        prev.map((c) =>
          c.id === cid
            ? {
                ...c,
                updatedAt: Date.now(),
                usage: {
                  inputTokens: priorUsage.inputTokens + usageAcc.inputTokens,
                  outputTokens: priorUsage.outputTokens + usageAcc.outputTokens,
                },
                messages: [
                  ...priorMessages,
                  userMsg,
                  ...live.map((m) => ({ ...m })),
                ],
              }
            : c,
        ),
      );
    };
    commit(); // show the user message immediately

    const enabledTools = preset.defaultTools.filter(
      (t) => !settings.disabledTools.includes(t),
    );

    const ac = new AbortController();
    abortRef.current = ac;

    await streamChat(
      {
        providerId: settings.providerId,
        model: settings.model,
        apiKey: settings.apiKeys[settings.providerId],
        baseURL: settings.baseURLs[settings.providerId] || undefined,
        system: preset.system,
        messages: toWireMessages([...priorMessages, userMsg]),
        enabledTools,
        effort: settings.effort,
      },
      (e) => {
        switch (e.type) {
          case "turn":
            current = { _id: uid(), role: "assistant", content: "" };
            live.push(current);
            setStatus(`running · step ${e.index + 1}`);
            commit();
            break;
          case "text":
            if (!current) {
              current = { _id: uid(), role: "assistant", content: "" };
              live.push(current);
            }
            current.content += e.delta;
            commit();
            break;
          case "thinking":
            if (current) {
              current.thinking = (current.thinking || "") + e.delta;
              commit();
            }
            break;
          case "tool_call":
            if (!current) {
              current = { _id: uid(), role: "assistant", content: "" };
              live.push(current);
            }
            current.toolCalls = [
              ...(current.toolCalls || []),
              {
                id: e.id,
                name: e.name,
                arguments: (e.arguments as Record<string, unknown>) || {},
              },
            ];
            setStatus(`tool · ${e.name}`);
            commit();
            break;
          case "tool_result":
            live.push({
              _id: uid(),
              role: "tool",
              toolCallId: e.id,
              toolName: e.name,
              content: e.content,
              isError: e.isError,
            });
            current = null;
            commit();
            break;
          case "error":
            live.push({
              _id: uid(),
              role: "assistant",
              content: e.message,
              _note: "error",
            });
            current = null;
            commit();
            break;
          case "usage":
            usageAcc.inputTokens += e.inputTokens || 0;
            usageAcc.outputTokens += e.outputTokens || 0;
            commit();
            break;
          case "done":
            setStatus("");
            break;
          case "end":
            break;
        }
      },
      ac.signal,
    );

    abortRef.current = null;
    setStreaming(false);
    setStatus("");
  }, [input, streaming, settings, currentConv, currentId, attachments]);

  const modelListId = `models-${settings.providerId}`;
  const modelOptions =
    settings.providerId === "ollama" && env?.ollama.models?.length
      ? env.ollama.models
      : providerCfg.models.map((m) => m.id);

  const convUsage = currentConv?.usage;
  const convCost =
    convUsage && currentConv
      ? estimateCostUSD(
          currentConv.providerId,
          currentConv.model,
          convUsage.inputTokens,
          convUsage.outputTokens,
        )
      : null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex overflow-hidden text-ink">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-line bg-bg-soft/60">
        <div className="edge-accent px-4 py-4">
          <div className="flex items-center gap-2">
            <Logo />
            <div>
              <div className="font-bold tracking-[0.3em] glow-cyan leading-none">
                AMARI
              </div>
              <div className="tag mt-1">agent terminal</div>
            </div>
          </div>
        </div>

        <div className="px-3 pt-3">
          <button
            onClick={newChat}
            className="focus-ring w-full text-left px-3 py-2 border border-line-bright text-cyber-cyan hover:shadow-glow text-[13px] flex items-center gap-2"
          >
            <span>+</span> new session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {convos.length === 0 ? (
            <p className="px-2 text-[11px] text-ink-faint">
              no sessions yet.
            </p>
          ) : (
            convos.map((c) => (
              <div
                key={c.id}
                onClick={() => setCurrentId(c.id)}
                className="group cursor-pointer px-2.5 py-2 border text-[12.5px] flex items-start gap-2"
                style={{
                  borderColor:
                    c.id === currentId ? "var(--line-bright)" : "transparent",
                  background:
                    c.id === currentId ? "rgba(0,229,255,0.05)" : "transparent",
                }}
              >
                <span className="text-ink-faint mt-0.5">›</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-ink">{c.title}</div>
                  <div className="tag mt-0.5 truncate">
                    {PROVIDERS[c.providerId]?.label} · {c.agentId}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-cyber-red"
                  title="delete"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-line text-[10.5px] text-ink-faint">
          <StatusDot ok={!!env?.local} />{" "}
          {env ? (env.local ? "local runtime" : "hosted runtime") : "…"}
          <br />
          <StatusDot ok={!!env?.ollama.reachable} /> ollama{" "}
          {env?.ollama.reachable
            ? `(${env.ollama.models.length})`
            : "offline"}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="edge-accent flex items-center gap-2 px-3 py-2 border-b border-line bg-bg-soft/40 flex-wrap">
          <Select
            value={settings.providerId}
            onChange={(v) => selectProvider(v as ProviderId)}
            options={PROVIDER_ORDER.map((id) => ({
              value: id,
              label: PROVIDERS[id].label,
            }))}
          />

          <input
            list={modelListId}
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
            placeholder="model id"
            className="focus-ring bg-bg-soft border border-line px-2 py-1 text-[12.5px] w-40"
          />
          <datalist id={modelListId}>
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <div className="flex items-center gap-1">
            {AGENT_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => update({ agentId: p.id })}
                title={p.blurb}
                className="focus-ring px-2 py-1 text-[11px] tracking-wider border"
                style={{
                  borderColor:
                    settings.agentId === p.id
                      ? "var(--cyan)"
                      : "var(--line)",
                  color:
                    settings.agentId === p.id
                      ? "var(--cyan)"
                      : "var(--ink-dim)",
                  background:
                    settings.agentId === p.id
                      ? "rgba(0,229,255,0.07)"
                      : "transparent",
                }}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {status ? (
              <span className="text-[11px] text-cyber-amber animate-flicker">
                ▮ {status}
              </span>
            ) : null}
            <button
              onClick={() => openInputRef.current?.click()}
              className="focus-ring px-2 py-1 text-ink-dim hover:text-cyber-cyan text-[13px]"
              title="open a file to view — xlsx, pdf, docx, csv, image…"
            >
              ▣ files
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="focus-ring px-2 py-1 text-ink-dim hover:text-cyber-cyan text-[13px]"
              title="settings"
            >
              ⚙ config
            </button>
          </div>
        </header>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!currentConv || currentConv.messages.length === 0 ? (
            <EmptyState
              providerLabel={providerCfg.label}
              model={settings.model}
              agent={getPreset(settings.agentId)}
              local={env?.local}
            />
          ) : (
            <div className="max-w-3xl mx-auto py-4">
              {currentConv.messages.map((m, i) => (
                <MessageView key={m._id || i} message={m} />
              ))}
              {streaming ? (
                <div className="px-4 py-2 text-cyber-cyan text-[12px] cursor-blink" />
              ) : null}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-line bg-bg-soft/50 px-3 py-3">
          <div className="max-w-3xl mx-auto">
            {attachments.length ? (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {attachments.map((a, i) => (
                  <span
                    key={a.path + i}
                    className="flex items-center gap-1.5 px-2 py-1 text-[11.5px] panel border border-line"
                  >
                    <button
                      onClick={() => setViewerFile(a.file)}
                      className="text-cyber-sky hover:text-cyber-cyan"
                      title="view"
                    >
                      ▣
                    </button>
                    <span className="text-ink-dim max-w-[180px] truncate">
                      {a.name}
                    </span>
                    <button
                      onClick={() =>
                        setAttachments((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="text-ink-faint hover:text-cyber-red"
                      title="remove"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="panel neon-border flex items-end gap-2 px-3 py-2">
              {env?.local ? (
                <button
                  onClick={() => attachInputRef.current?.click()}
                  disabled={streaming || uploading}
                  className="focus-ring text-ink-dim hover:text-cyber-cyan pt-1 disabled:opacity-50"
                  title="attach files for the agent to read (xlsx, pdf, docx…)"
                >
                  {uploading ? "…" : "📎"}
                </button>
              ) : (
                <span className="text-cyber-cyan select-none pt-1.5">❯</span>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={
                  streaming
                    ? "agent is working…"
                    : "message the agent — Enter to send, Shift+Enter for newline"
                }
                disabled={streaming}
                className="flex-1 bg-transparent outline-none resize-none py-1.5 text-[13.5px] max-h-40 disabled:opacity-50"
                style={{ minHeight: "28px" }}
              />
              {streaming ? (
                <button
                  onClick={stop}
                  className="focus-ring px-3 py-1.5 text-[12px] border border-cyber-red text-cyber-red hover:bg-[rgba(255,77,109,0.1)]"
                >
                  ◼ stop
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  className="focus-ring px-3 py-1.5 text-[12px] border border-line-bright text-cyber-cyan hover:shadow-glow disabled:opacity-40"
                >
                  run ⏎
                </button>
              )}
            </div>
            <div className="flex justify-between items-center mt-1.5 px-1 gap-2">
              <span className="tag truncate">
                {providerCfg.label} / {settings.model || "—"} ·{" "}
                {getPreset(settings.agentId).name}
              </span>
              {convUsage ? (
                <span className="tag whitespace-nowrap text-ink-dim">
                  ↑{fmtTokens(convUsage.inputTokens)} ↓
                  {fmtTokens(convUsage.outputTokens)}
                  {convCost != null
                    ? ` · ~$${convCost.toFixed(convCost < 1 ? 4 : 2)}`
                    : ""}
                </span>
              ) : null}
              <span className="tag whitespace-nowrap">
                {env?.local ? "local" : "hosted"} · effort {settings.effort}
              </span>
            </div>
          </div>
        </div>
      </main>

      <input
        ref={openInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setViewerFile(f);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={attachInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onAttach(e.target.files)}
      />

      {viewerFile ? (
        <FileViewer file={viewerFile} onClose={() => setViewerFile(null)} />
      ) : null}

      {showSettings ? (
        <SettingsModal
          settings={settings}
          onChange={update}
          onClose={() => setShowSettings(false)}
          env={env}
          onRefreshOllama={refreshEnv}
        />
      ) : null}
    </div>
  );
}

// ── small components ──────────────────────────────────────────────────────────

function Logo() {
  return (
    <div
      className="w-8 h-8 grid place-items-center border border-line-bright text-cyber-cyan glow"
      style={{ boxShadow: "0 0 14px rgba(0,229,255,0.25)" }}
    >
      <span className="text-lg leading-none">◈</span>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full align-middle"
      style={{
        background: ok ? "var(--green)" : "var(--ink-faint)",
        boxShadow: ok ? "0 0 6px var(--green)" : "none",
      }}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring bg-bg-soft border border-line px-2 py-1 text-[12.5px] text-ink"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-bg-soft">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function EmptyState({
  providerLabel,
  model,
  agent,
  local,
}: {
  providerLabel: string;
  model: string;
  agent: { name: string; blurb: string };
  local?: boolean;
}) {
  return (
    <div className="h-full grid place-items-center px-4">
      <div className="text-center max-w-lg">
        <div className="mb-5 select-none">
          <div className="text-cyber-cyan glow text-4xl md:text-5xl font-bold tracking-[0.45em] pl-[0.45em]">
            AMARI
          </div>
          <div className="mx-auto mt-3 h-px w-48 bg-gradient-to-r from-transparent via-cyber-cyan to-transparent opacity-60" />
        </div>
        <p className="text-ink-dim text-[13px] leading-relaxed">
          local-first agent terminal · {providerLabel} /{" "}
          <span className="text-cyber-sky">{model || "pick a model"}</span>
        </p>
        <p className="mt-2 text-[12px] text-ink-faint">
          mode <span className="text-cyber-cyan">{agent.name}</span> —{" "}
          {agent.blurb}
        </p>
        <div className="mt-6 inline-block text-left text-[12px] text-ink-faint panel px-4 py-3">
          <p className="mb-1">› try:</p>
          <p className="text-ink-dim">
            {local
              ? "scaffold a node script in the workspace and run it"
              : "research the latest on a topic and summarize with sources"}
          </p>
          <p className="text-ink-dim">explain this error / refactor this code</p>
        </div>
        <p className="mt-5 tag">
          set your api keys in ⚙ config to begin
        </p>
      </div>
    </div>
  );
}
