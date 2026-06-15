import type { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getWorkspace, localToolsEnabled } from "@/lib/agent/tools";

// Saves an uploaded file into the workspace so the agent can read it with the
// read_document tool. Local only (needs a writable filesystem).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!localToolsEnabled()) {
    return Response.json(
      { error: "Uploads to the agent workspace require local mode." },
      { status: 400 },
    );
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    const ws = getWorkspace();
    const dir = path.join(ws, "uploads");
    await fs.mkdir(dir, { recursive: true });
    const safe =
      path.basename(file.name).replace(/[^\w.\- ]+/g, "_") || `file-${Date.now()}`;
    await fs.writeFile(path.join(dir, safe), Buffer.from(await file.arrayBuffer()));
    return Response.json({ path: `uploads/${safe}`, name: safe });
  } catch (e: any) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
