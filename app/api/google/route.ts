import type { NextRequest } from "next/server";
import { localToolsEnabled } from "@/lib/agent/tools";
import { getStatus } from "@/lib/google/oauth";
import { clearTokens, saveCreds } from "@/lib/google/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!localToolsEnabled()) {
    return Response.json({ configured: false, connected: false, local: false });
  }
  const s = await getStatus();
  return Response.json({ ...s, local: true });
}

export async function POST(req: NextRequest) {
  if (!localToolsEnabled()) {
    return Response.json(
      { error: "Google integration requires local mode." },
      { status: 400 },
    );
  }
  const body = await req.json().catch(() => ({}) as any);

  if (body.action === "config") {
    if (!body.clientId || !body.clientSecret) {
      return Response.json(
        { error: "clientId and clientSecret are required" },
        { status: 400 },
      );
    }
    await saveCreds({
      clientId: String(body.clientId).trim(),
      clientSecret: String(body.clientSecret).trim(),
    });
    return Response.json({ ok: true });
  }

  if (body.action === "disconnect") {
    await clearTokens();
    return Response.json({ ok: true });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
