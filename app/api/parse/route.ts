import type { NextRequest } from "next/server";
import { parseForViewer } from "@/lib/documents";

// Parses an uploaded file for the in-app viewer. Works in any environment
// (the file arrives in the request body — no filesystem needed).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseForViewer(file.name, buf);
    return Response.json({ name: file.name, size: buf.length, ...parsed });
  } catch (e: any) {
    return Response.json(
      { error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
