// Client-safe tool metadata (mirrors lib/agent/tools.ts, which is server-only
// because it imports node:fs / node:child_process).

export interface ToolMeta {
  name: string;
  local: boolean;
  desc: string;
}

export const TOOL_META: ToolMeta[] = [
  { name: "list_dir", local: true, desc: "List files in the workspace" },
  { name: "read_file", local: true, desc: "Read a workspace file" },
  { name: "read_document", local: true, desc: "Read xlsx / docx / pdf as text" },
  { name: "write_file", local: true, desc: "Create / overwrite a file" },
  { name: "edit_file", local: true, desc: "Find-and-replace in a file" },
  { name: "run_shell", local: true, desc: "Run a shell command (60s)" },
  { name: "web_fetch", local: false, desc: "Fetch a URL's text" },
  { name: "web_search", local: false, desc: "Search the web (DuckDuckGo)" },
  { name: "gdrive_search", local: true, desc: "Search Google Drive (needs sign-in)" },
  { name: "gdrive_read", local: true, desc: "Read a Drive file (needs sign-in)" },
  { name: "gmail_search", local: true, desc: "Search Gmail (needs sign-in)" },
  { name: "gmail_read", local: true, desc: "Read a Gmail message (needs sign-in)" },
];
