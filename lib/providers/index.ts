import type { Provider, ProviderId } from "../types";
import { PROVIDERS } from "../catalog";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatProvider } from "./openai-compat";

export { PROVIDERS, PROVIDER_ORDER } from "../catalog";
export type { ProviderConfig, ModelInfo } from "../catalog";

/** Server-only: instantiate the implementation for a provider id. */
export function getProvider(id: ProviderId): Provider {
  const cfg = PROVIDERS[id];
  if (!cfg) throw new Error(`Unknown provider: ${id}`);
  return cfg.kind === "anthropic"
    ? new AnthropicProvider()
    : new OpenAICompatProvider(id);
}
