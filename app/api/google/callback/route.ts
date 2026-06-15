import type { NextRequest } from "next/server";
import { localToolsEnabled } from "@/lib/agent/tools";
import { exchangeCode } from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!localToolsEnabled()) {
    return Response.redirect(`${origin}/?google=error`, 302);
  }
  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error");
  if (err || !code) {
    return Response.redirect(`${origin}/?google=${err || "denied"}`, 302);
  }
  const r = await exchangeCode(code, origin);
  return Response.redirect(
    `${origin}/?google=${r.ok ? "connected" : "error"}`,
    302,
  );
}
