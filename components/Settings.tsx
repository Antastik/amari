"use client";

import { useState } from "react";
import { PROVIDERS, PROVIDER_ORDER } from "@/lib/catalog";
import { TOOL_META } from "@/lib/tool-meta";
import type { EnvInfo, Effort, Settings } from "@/lib/store";
import type { ProviderId } from "@/lib/types";

const EFFORTS: Effort[] = ["low", "medium", "high", "max"];

export function SettingsModal({
  settings,
  onChange,
  onClose,
  env,
  onRefreshOllama,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  env: EnvInfo | null;
  onRefreshOllama: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);

  const setKey = (id: ProviderId, v: string) =>
    onChange({ apiKeys: { ...settings.apiKeys, [id]: v } });
  const setBase = (id: ProviderId, v: string) =>
    onChange({ baseURLs: { ...settings.baseURLs, [id]: v } });

  const toggleTool = (name: string) => {
    const off = settings.disabledTools.includes(name);
    onChange({
      disabledTools: off
        ? settings.disabledTools.filter((n) => n !== name)
        : [...settings.disabledTools, name],
    });
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center p-4 md:p-10 overflow-y-auto"
      style={{ background: "rgba(2,4,8,0.72)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="panel neon-border w-full max-w-2xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edge-accent flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="flex items-center gap-3">
            <span className="glow-cyan font-bold tracking-widest">CONFIG</span>
            <span className="tag">amari // settings</span>
          </div>
          <button
            onClick={onClose}
            className="focus-ring px-2 text-ink-dim hover:text-cyber-cyan"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-6 max-h-[72vh] overflow-y-auto">
          {/* Runtime status */}
          <section>
            <h3 className="tag mb-2">runtime</h3>
            <div className="grid grid-cols-2 gap-2 text-[12.5px]">
              <Stat
                label="mode"
                value={env ? (env.local ? "LOCAL" : "HOSTED") : "…"}
                good={!!env?.local}
              />
              <Stat
                label="ollama"
                value={
                  env?.ollama.reachable
                    ? `${env.ollama.models.length} models`
                    : "offline"
                }
                good={!!env?.ollama.reachable}
              />
            </div>
            {env?.local ? (
              <p className="mt-2 text-[11px] text-ink-faint break-all">
                workspace: {env.workspace}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-ink-faint">
                Filesystem + shell tools are disabled in hosted mode; only web
                tools run.
              </p>
            )}
          </section>

          {/* API keys */}
          <section>
            <h3 className="tag mb-2">api keys (stored in this browser)</h3>
            <div className="space-y-3">
              {PROVIDER_ORDER.map((id) => {
                const cfg = PROVIDERS[id];
                const hasEnv = env?.providers?.[id]?.hasEnvKey;
                if (id === "ollama") {
                  return (
                    <div key={id}>
                      <label className="flex items-center justify-between text-[12.5px] mb-1">
                        <span className="text-ink">{cfg.label}</span>
                        <span className="tag">base url</span>
                      </label>
                      <input
                        className="focus-ring w-full bg-bg-soft border border-line px-3 py-1.5 text-[12.5px]"
                        placeholder={cfg.defaultBaseURL}
                        value={settings.baseURLs[id] ?? ""}
                        onChange={(e) => setBase(id, e.target.value)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={id}>
                    <label className="flex items-center justify-between text-[12.5px] mb-1">
                      <span className="text-ink">{cfg.label}</span>
                      {hasEnv ? (
                        <span className="tag" style={{ color: "var(--green)" }}>
                          env key set
                        </span>
                      ) : cfg.keyUrl ? (
                        <a
                          className="tag"
                          href={cfg.keyUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          get key ↗
                        </a>
                      ) : null}
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      className="focus-ring w-full bg-bg-soft border border-line px-3 py-1.5 text-[12.5px]"
                      placeholder={hasEnv ? "(using server env key)" : cfg.keyHint}
                      value={settings.apiKeys[id] ?? ""}
                      onChange={(e) => setKey(id, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
            <button
              onClick={onRefreshOllama}
              className="focus-ring mt-3 text-[11px] text-cyber-sky hover:text-cyber-cyan"
            >
              ↻ refresh ollama models
            </button>
          </section>

          {/* Tools */}
          <section>
            <h3 className="tag mb-2">tools</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {TOOL_META.map((t) => {
                const enabled = !settings.disabledTools.includes(t.name);
                const blockedHosted = t.local && env && !env.local;
                return (
                  <button
                    key={t.name}
                    disabled={!!blockedHosted}
                    onClick={() => toggleTool(t.name)}
                    className="focus-ring flex items-center gap-2 px-2.5 py-1.5 border text-left text-[12.5px] disabled:opacity-40"
                    style={{
                      borderColor: enabled ? "var(--line-bright)" : "var(--line)",
                      background: enabled
                        ? "rgba(0,229,255,0.05)"
                        : "transparent",
                    }}
                  >
                    <span
                      style={{
                        color: enabled ? "var(--cyan)" : "var(--ink-faint)",
                      }}
                    >
                      {enabled ? "◉" : "○"}
                    </span>
                    <span className="flex-1">
                      <span className="text-ink">{t.name}</span>
                      <span className="block text-[10.5px] text-ink-faint">
                        {t.desc}
                        {t.local ? " · local" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Reasoning effort */}
          <section>
            <h3 className="tag mb-2">claude reasoning effort</h3>
            <div className="flex gap-1.5">
              {EFFORTS.map((e) => (
                <button
                  key={e}
                  onClick={() => onChange({ effort: e })}
                  className="focus-ring px-3 py-1.5 text-[12px] border"
                  style={{
                    borderColor:
                      settings.effort === e
                        ? "var(--cyan)"
                        : "var(--line)",
                    color:
                      settings.effort === e ? "var(--cyan)" : "var(--ink-dim)",
                    background:
                      settings.effort === e
                        ? "rgba(0,229,255,0.07)"
                        : "transparent",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Applies to Claude (Opus 4.6+, Sonnet 4.6) with adaptive thinking.
            </p>
          </section>

          {/* Advanced base URLs */}
          <section>
            <button
              onClick={() => setAdvanced((v) => !v)}
              className="focus-ring tag hover:text-cyber-cyan"
            >
              {advanced ? "▾" : "▸"} advanced — base url overrides
            </button>
            {advanced ? (
              <div className="mt-2 space-y-2">
                {PROVIDER_ORDER.filter((id) => id !== "ollama").map((id) => {
                  const cfg = PROVIDERS[id];
                  return (
                    <div key={id}>
                      <label className="text-[11px] text-ink-faint">
                        {cfg.label}
                      </label>
                      <input
                        className="focus-ring w-full bg-bg-soft border border-line px-3 py-1.5 text-[12px]"
                        placeholder={cfg.defaultBaseURL || "(provider default)"}
                        value={settings.baseURLs[id] ?? ""}
                        onChange={(e) => setBase(id, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end">
          <button
            onClick={onClose}
            className="focus-ring px-4 py-1.5 text-[12.5px] border border-line-bright text-cyber-cyan hover:shadow-glow"
          >
            done
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="border border-line px-3 py-2 bg-bg-soft">
      <div className="tag">{label}</div>
      <div
        className="text-[13px] font-medium"
        style={{ color: good ? "var(--green)" : "var(--ink-dim)" }}
      >
        {value}
      </div>
    </div>
  );
}
