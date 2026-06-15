import type { NextRequest } from "next/server";
import { PROVIDERS } from "@/lib/providers";
import { listOllamaModels } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");

  if (provider === "ollama") {
    const base =
      url.searchParams.get("baseURL") ||
      process.env.OLLAMA_BASE_URL ||
      PROVIDERS.ollama.defaultBaseURL!;
    try {
      const models = await listOllamaModels(base);
      return Response.json({ models, reachable: true });
    } catch (e: any) {
      return Response.json({
        models: [],
        reachable: false,
        error: e?.message || String(e),
      });
    }
  }

  const cfg = provider ? (PROVIDERS as any)[provider] : null;
  return Response.json({
    models: cfg ? cfg.models.map((m: any) => m.id) : [],
  });
}
