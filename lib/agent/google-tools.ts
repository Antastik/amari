import type { ToolRuntime } from "./tools";
import { getStatus, getValidAccessToken } from "../google/oauth";
import {
  driveRead,
  driveSearch,
  gmailRead,
  gmailSearch,
} from "../google/api";

const clip = (s: string, n = 12000) =>
  s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;

async function token(): Promise<string> {
  const t = await getValidAccessToken();
  if (!t) {
    throw new Error(
      "Google is not connected. Sign in via Settings → Google to use this tool.",
    );
  }
  return t;
}

export const GOOGLE_TOOLS: ToolRuntime[] = [
  {
    name: "gdrive_search",
    local: true,
    description:
      "Search the user's Google Drive by full-text query. Returns matching files with name, id, type and link. Use gdrive_read to open one.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search text." } },
      required: ["query"],
    },
    async run(args) {
      const files = await driveSearch(await token(), String(args.query || ""));
      if (!files.length)
        return { content: `No Drive files matched "${args.query}".` };
      return {
        content: clip(
          files
            .map(
              (f) =>
                `• ${f.name}  [${f.mimeType}]  id=${f.id}` +
                (f.webViewLink ? `\n  ${f.webViewLink}` : ""),
            )
            .join("\n"),
        ),
      };
    },
  },
  {
    name: "gdrive_read",
    local: true,
    description:
      "Read a Google Drive file's text content by id. Google Docs/Sheets are exported to text/CSV. Get the id from gdrive_search first.",
    parameters: {
      type: "object",
      properties: { fileId: { type: "string" } },
      required: ["fileId"],
    },
    async run(args) {
      const r = await driveRead(await token(), String(args.fileId || ""));
      return { content: clip(`# ${r.name}\n\n${r.text}`) };
    },
  },
  {
    name: "gmail_search",
    local: true,
    description:
      "Search the user's Gmail using Gmail's query syntax (e.g. \"from:alice newer_than:7d has:attachment\"). Returns a list of messages with ids. Use gmail_read to open one.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    async run(args) {
      const msgs = await gmailSearch(await token(), String(args.query || ""));
      if (!msgs.length)
        return { content: `No emails matched "${args.query}".` };
      return {
        content: clip(
          msgs
            .map(
              (m) =>
                `• id=${m.id}  |  ${m.date}\n  From: ${m.from}\n  Subj: ${m.subject}\n  ${m.snippet}`,
            )
            .join("\n\n"),
        ),
      };
    },
  },
  {
    name: "gmail_read",
    local: true,
    description:
      "Read a full Gmail message (headers + body) by id. Get the id from gmail_search first.",
    parameters: {
      type: "object",
      properties: { messageId: { type: "string" } },
      required: ["messageId"],
    },
    async run(args) {
      const m = await gmailRead(await token(), String(args.messageId || ""));
      return {
        content: clip(
          `From: ${m.from}\nTo: ${m.to}\nDate: ${m.date}\nSubject: ${m.subject}\n\n${m.body}`,
        ),
      };
    },
  },
];

export async function isGoogleConnected(): Promise<boolean> {
  return (await getStatus()).connected;
}
