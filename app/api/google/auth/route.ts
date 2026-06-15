import type { NextRequest } from "next/server";
import { localToolsEnabled } from "@/lib/agent/tools";
import { buildAuthUrl } from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!localToolsEnabled()) {
    return new Response("Google integration requires local mode.", {
      status: 400,
    });
  }
  const url = await buildAuthUrl(origin);
  if (!url) {
    return Response.redirect(`${origin}/?google=notconfigured`, 302);
  }
  return Response.redirect(url, 302);
}
