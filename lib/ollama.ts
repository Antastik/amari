// Best-effort lookup of locally installed Ollama models via its native
// /api/tags endpoint (the OpenAI-compat base URL ends in /v1).
export async function listOllamaModels(baseURL: string): Promise<string[]> {
  const root = baseURL.replace(/\/v1\/?$/, "");
  const res = await fetch(`${root}/api/tags`, {
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data: any = await res.json();
  return (data?.models ?? [])
    .map((m: any) => m?.name)
    .filter((n: any): n is string => typeof n === "string" && n.length > 0);
}
