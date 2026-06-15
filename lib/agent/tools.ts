import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { documentToText } from "../documents";

// ─────────────────────────────────────────────────────────────────────────────
// Agent tools. File/shell tools are sandboxed to a workspace directory and only
// enabled when running locally. Web tools work anywhere (incl. Vercel).
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolContext {
  workspace: string;
}

export interface ToolRuntime {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Requires a local filesystem/shell (disabled on serverless). */
  local: boolean;
  run(
    args: any,
    ctx: ToolContext,
  ): Promise<{ content: string; isError?: boolean }>;
}

const MAX_OUTPUT = 12000;
const clip = (s: string, n = MAX_OUTPUT) =>
  s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;

export function getWorkspace(): string {
  const raw = process.env.AMARI_WORKSPACE?.trim();
  return path.resolve(raw && raw.length ? raw : path.join(process.cwd(), "workspace"));
}

export function localToolsEnabled(): boolean {
  if (process.env.AMARI_DISABLE_LOCAL_TOOLS) return false;
  // Serverless platforms have ephemeral/read-only FS and no useful shell.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return true;
}

function resolveInWorkspace(ws: string, p: string): string {
  const target = path.resolve(ws, p ?? ".");
  if (target !== ws && !target.startsWith(ws + path.sep)) {
    throw new Error(
      `path "${p}" escapes the workspace sandbox (${ws}). Use a relative path.`,
    );
  }
  return target;
}

async function ensureWorkspace(ws: string) {
  await fs.mkdir(ws, { recursive: true });
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Tool implementations ──────────────────────────────────────────────────────

const listDir: ToolRuntime = {
  name: "list_dir",
  description:
    "List files and folders inside the workspace at the given relative path (default: workspace root).",
  local: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path. Defaults to '.'" },
    },
  },
  async run(args, ctx) {
    await ensureWorkspace(ctx.workspace);
    const dir = resolveInWorkspace(ctx.workspace, args?.path || ".");
    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (!entries.length) return { content: "(empty directory)" };
    const lines = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => `${e.isDirectory() ? "[dir] " : "      "}${e.name}`);
    return { content: clip(lines.join("\n")) };
  },
};

const readFile: ToolRuntime = {
  name: "read_file",
  description: "Read a UTF-8 text file from the workspace.",
  local: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file." },
    },
    required: ["path"],
  },
  async run(args, ctx) {
    const file = resolveInWorkspace(ctx.workspace, args.path);
    const data = await fs.readFile(file, "utf8");
    return { content: clip(data) };
  },
};

const readDocument: ToolRuntime = {
  name: "read_document",
  description:
    "Read a document and return its text content. Supports spreadsheets (.xlsx/.xls/.csv → CSV), Word (.docx), PDF (.pdf), and plain text/code. Use this instead of read_file for spreadsheets, Word docs, and PDFs.",
  local: true,
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Relative path to the document in the workspace, e.g. uploads/report.pdf",
      },
    },
    required: ["path"],
  },
  async run(args, ctx) {
    const file = resolveInWorkspace(ctx.workspace, args.path);
    const buf = await fs.readFile(file);
    const text = await documentToText(path.basename(file), buf);
    return { content: text };
  },
};

const writeFile: ToolRuntime = {
  name: "write_file",
  description:
    "Create or overwrite a UTF-8 text file in the workspace. Creates parent folders as needed.",
  local: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file." },
      content: { type: "string", description: "Full file contents." },
    },
    required: ["path", "content"],
  },
  async run(args, ctx) {
    await ensureWorkspace(ctx.workspace);
    const file = resolveInWorkspace(ctx.workspace, args.path);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, String(args.content ?? ""), "utf8");
    return { content: `Wrote ${String(args.content ?? "").length} bytes to ${args.path}` };
  },
};

const editFile: ToolRuntime = {
  name: "edit_file",
  description:
    "Replace text in a workspace file. Replaces the first occurrence of `find` with `replace` (set all=true for every occurrence).",
  local: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file." },
      find: { type: "string", description: "Exact text to find." },
      replace: { type: "string", description: "Replacement text." },
      all: { type: "boolean", description: "Replace all occurrences." },
    },
    required: ["path", "find", "replace"],
  },
  async run(args, ctx) {
    const file = resolveInWorkspace(ctx.workspace, args.path);
    const original = await fs.readFile(file, "utf8");
    if (!original.includes(args.find)) {
      return { content: `"find" text not found in ${args.path}`, isError: true };
    }
    const updated = args.all
      ? original.split(args.find).join(args.replace)
      : original.replace(args.find, args.replace);
    await fs.writeFile(file, updated, "utf8");
    return { content: `Edited ${args.path}` };
  },
};

const runShell: ToolRuntime = {
  name: "run_shell",
  description:
    "Run a shell command from the workspace directory and return its combined stdout/stderr. Use for builds, tests, git, scaffolding, etc. 60s timeout.",
  local: true,
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run." },
    },
    required: ["command"],
  },
  async run(args, ctx) {
    await ensureWorkspace(ctx.workspace);
    return await new Promise((resolve) => {
      const child = spawn(args.command, {
        cwd: ctx.workspace,
        shell: true,
        env: process.env,
      });
      let out = "";
      const onData = (d: Buffer) => {
        out += d.toString();
        if (out.length > MAX_OUTPUT * 2) child.kill();
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      const timer = setTimeout(() => {
        out += "\n…[killed after 60s timeout]";
        child.kill("SIGKILL");
      }, 60_000);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          content: clip(`$ ${args.command}\n${out.trim()}\n[exit ${code}]`),
          isError: code !== 0,
        });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ content: `Failed to run: ${err.message}`, isError: true });
      });
    });
  },
};

const webFetch: ToolRuntime = {
  name: "web_fetch",
  description:
    "Fetch a URL and return its readable text content (HTML is stripped). Use to read a known web page or API.",
  local: false,
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute http(s) URL." },
    },
    required: ["url"],
  },
  async run(args) {
    const url = String(args.url || "");
    if (!/^https?:\/\//i.test(url)) {
      return { content: "url must start with http:// or https://", isError: true };
    }
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Amari agent)" },
        signal: AbortSignal.timeout(20_000),
      });
      const type = res.headers.get("content-type") || "";
      const body = await res.text();
      const text = /html/i.test(type) ? stripHtml(body) : body;
      return { content: clip(`[${res.status}] ${url}\n\n${text}`) };
    } catch (e: any) {
      return { content: `fetch failed: ${e?.message || e}`, isError: true };
    }
  },
};

const webSearch: ToolRuntime = {
  name: "web_search",
  description:
    "Search the web and return the top results (title, url, snippet). Best-effort, no API key required.",
  local: false,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
    },
    required: ["query"],
  },
  async run(args) {
    const q = String(args.query || "").trim();
    if (!q) return { content: "query is required", isError: true };
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (Amari agent)" },
          signal: AbortSignal.timeout(20_000),
        },
      );
      const html = await res.text();
      const results: string[] = [];
      const re =
        /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && results.length < 8) {
        let href = m[1];
        const title = stripHtml(m[2]);
        // DuckDuckGo wraps links in a redirect; pull out uddg= target.
        const uddg = href.match(/[?&]uddg=([^&]+)/);
        if (uddg) href = decodeURIComponent(uddg[1]);
        if (title) results.push(`• ${title}\n  ${href}`);
      }
      if (!results.length) {
        return { content: `No results parsed for "${q}".`, isError: true };
      }
      return { content: clip(`Results for "${q}":\n\n${results.join("\n\n")}`) };
    } catch (e: any) {
      return { content: `search failed: ${e?.message || e}`, isError: true };
    }
  },
};

export const ALL_TOOLS: ToolRuntime[] = [
  listDir,
  readFile,
  readDocument,
  writeFile,
  editFile,
  runShell,
  webFetch,
  webSearch,
];

/** Pick the runnable tools given local capability + the user's enabled set. */
export function selectTools(
  allowLocal: boolean,
  enabledNames?: string[],
  extra: ToolRuntime[] = [],
): ToolRuntime[] {
  return [...ALL_TOOLS, ...extra].filter((t) => {
    if (t.local && !allowLocal) return false;
    if (enabledNames && !enabledNames.includes(t.name)) return false;
    return true;
  });
}
