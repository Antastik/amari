import { getWorkspace, localToolsEnabled } from "@/lib/agent/tools";
import { PROVIDERS } from "@/lib/providers";
import { listOllamaModels } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const local = localToolsEnabled();
  const workspace = getWorkspace();

  const providers: Record<string, { hasEnvKey: boolean }> = {};
  for (const [id, cfg] of Object.entries(PROVIDERS)) {
    providers[id] = {
      hasEnvKey:
        id === "ollama" ? false : !!(cfg.envKey && process.env[cfg.envKey]),
    };
  }

  const ollamaBase =
    process.env.OLLAMA_BASE_URL || PROVIDERS.ollama.defaultBaseURL!;
  let ollama: { reachable: boolean; models: string[]; baseURL: string } = {
    reachable: false,
    models: [],
    baseURL: ollamaBase,
  };
  try {
    const models = await listOllamaModels(ollamaBase);
    ollama = { reachable: true, models, baseURL: ollamaBase };
  } catch {
    /* Ollama not running — leave reachable:false */
  }

  return Response.json({ local, workspace, providers, ollama });
}
