import type { ProviderId } from "./types";

// Approximate USD price per 1M tokens, [input, output]. Provider pricing drifts,
// so treat these as estimates. Local models are free. Unknown models → no estimate.
const PRICES: Record<string, [number, number]> = {
  // Anthropic
  "claude-fable-5": [10, 50],
  "claude-opus-4-8": [5, 25],
  "claude-opus-4-7": [5, 25],
  "claude-opus-4-6": [5, 25],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5": [1, 5],
  // OpenAI (approx)
  "gpt-4o": [2.5, 10],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2, 8],
  "o3-mini": [1.1, 4.4],
  // Google (approx)
  "gemini-2.0-flash": [0.1, 0.4],
  "gemini-2.0-flash-lite": [0.075, 0.3],
  "gemini-1.5-pro": [1.25, 5],
  "gemini-1.5-flash": [0.075, 0.3],
  // Kimi / Moonshot (approx)
  "kimi-k2": [0.6, 2.5],
  "moonshot-v1-128k": [2, 5],
  "moonshot-v1-32k": [1.2, 1.2],
  "moonshot-v1-8k": [0.2, 0.2],
  // OpenRouter common (approx)
  "deepseek-chat": [0.27, 1.1],
  "llama-3.3-70b": [0.12, 0.3],
};

/** Estimate cost in USD for a turn/conversation. Returns null if unknown. */
export function estimateCostUSD(
  providerId: ProviderId,
  model: string,
  inTok: number,
  outTok: number,
): number | null {
  if (providerId === "ollama") return 0;
  const m = (model || "").toLowerCase();
  let price = PRICES[m];
  if (!price) {
    for (const key of Object.keys(PRICES)) {
      if (m.includes(key)) {
        price = PRICES[key];
        break;
      }
    }
  }
  if (!price) return null;
  return (inTok / 1e6) * price[0] + (outTok / 1e6) * price[1];
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
