// ─────────────────────────────────────────────────────────────────────────────
// Server-side document parsing. Used by /api/parse (the in-app viewer) and the
// read_document agent tool. Handles spreadsheets, Word docs, PDFs, and text.
// Do NOT import this from client code — it pulls in xlsx/mammoth/unpdf.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from "xlsx";

export type ParsedDoc =
  | { kind: "sheet"; sheets: { name: string; html: string; csv: string }[] }
  | { kind: "html"; html: string }
  | { kind: "pdf"; text: string; pageCount: number }
  | { kind: "text"; text: string }
  | { kind: "image" }
  | { kind: "unknown"; text: string };

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "jsonl", "log", "csv", "tsv",
  "js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "h",
  "cpp", "cs", "php", "sh", "bash", "zsh", "yml", "yaml", "toml", "ini",
  "xml", "html", "css", "scss", "sql", "env",
]);
const SHEET_EXT = new Set(["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

export function extOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export function isImage(filename: string): boolean {
  return IMAGE_EXT.has(extOf(filename));
}

/** Rich parse for the in-app viewer. */
export async function parseForViewer(
  filename: string,
  buf: Buffer,
): Promise<ParsedDoc> {
  const ext = extOf(filename);

  if (IMAGE_EXT.has(ext)) return { kind: "image" };

  if (SHEET_EXT.has(ext)) {
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheets = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      return {
        name,
        html: XLSX.utils.sheet_to_html(ws, { id: `s-${name}` }),
        csv: XLSX.utils.sheet_to_csv(ws),
      };
    });
    return { kind: "sheet", sheets };
  }

  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return { kind: "html", html: value || "<p>(empty document)</p>" };
  }

  if (ext === "pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return {
      kind: "pdf",
      text: typeof text === "string" ? text : (text as string[]).join("\n\n"),
      pageCount: totalPages,
    };
  }

  if (TEXT_EXT.has(ext) || !ext) {
    return { kind: "text", text: buf.toString("utf8") };
  }

  // Best effort: try utf8.
  return { kind: "unknown", text: buf.toString("utf8").slice(0, 20000) };
}

const clip = (s: string, n = 12000) =>
  s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;

/** Flatten a document to text/markdown for the agent (read_document tool). */
export async function documentToText(
  filename: string,
  buf: Buffer,
): Promise<string> {
  const ext = extOf(filename);

  if (IMAGE_EXT.has(ext)) {
    return `[${filename} is an image (${buf.length} bytes); cannot read as text]`;
  }

  if (SHEET_EXT.has(ext)) {
    const wb = XLSX.read(buf, { type: "buffer" });
    const parts = wb.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return `## Sheet: ${name}\n${csv}`;
    });
    return clip(parts.join("\n\n"));
  }

  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return clip(value || "(empty document)");
  }

  if (ext === "pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const out = typeof text === "string" ? text : (text as string[]).join("\n\n");
    return clip(out || "(no extractable text)");
  }

  return clip(buf.toString("utf8"));
}
