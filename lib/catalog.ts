import type { ProviderId } from "./types";

// Pure provider metadata + model lists. No SDK imports here, so this is safe to
// import from client components (the actual provider implementations live in
// lib/providers/* and are server-only).

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  kind: "anthropic" | "openai";
  envKey?: string;
  defaultBaseURL?: string;
  needsKey: boolean;
  local?: boolean;
  models: ModelInfo[];
  keyHint?: string;
  keyUrl?: string;
  allowCustomModel?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: "anthropic",
    label: "Claude",
    kind: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…",
    allowCustomModel: true,
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    envKey: "OPENAI_API_KEY",
    defaultBaseURL: "https://api.openai.com/v1",
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    allowCustomModel: true,
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "o3-mini", label: "o3-mini" },
    ],
  },
  google: {
    id: "google",
    label: "Gemini",
    kind: "openai",
    envKey: "GEMINI_API_KEY",
    defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…",
    allowCustomModel: true,
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
  },
  moonshot: {
    id: "moonshot",
    label: "Kimi (Moonshot)",
    kind: "openai",
    envKey: "MOONSHOT_API_KEY",
    defaultBaseURL: "https://api.moonshot.ai/v1",
    needsKey: true,
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    keyHint: "sk-…",
    allowCustomModel: true,
    models: [
      { id: "kimi-k2-0711-preview", label: "Kimi K2" },
      { id: "moonshot-v1-128k", label: "Moonshot v1 128k" },
      { id: "moonshot-v1-32k", label: "Moonshot v1 32k" },
      { id: "moonshot-v1-8k", label: "Moonshot v1 8k" },
    ],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    envKey: "OPENROUTER_API_KEY",
    defaultBaseURL: "https://openrouter.ai/api/v1",
    needsKey: true,
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-…",
    allowCustomModel: true,
    models: [
      { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
      { id: "moonshotai/kimi-k2", label: "Kimi K2" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    ],
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai",
    envKey: "OLLAMA_BASE_URL",
    defaultBaseURL: "http://localhost:11434/v1",
    needsKey: false,
    local: true,
    allowCustomModel: true,
    models: [
      { id: "llama3.2", label: "llama3.2" },
      { id: "qwen2.5-coder", label: "qwen2.5-coder" },
      { id: "deepseek-r1", label: "deepseek-r1" },
      { id: "mistral", label: "mistral" },
    ],
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "moonshot",
  "openrouter",
  "ollama",
];
