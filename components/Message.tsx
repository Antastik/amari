"use client";

import type { StoredMessage } from "@/lib/store";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Minimal, safe markdown: escape first, then add only our own tags.
function renderMarkdown(text: string): string {
  let out = escapeHtml(text);
  // fenced code blocks
  out = out.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre><code data-lang="${lang}">${code.replace(/\n$/, "")}</code></pre>`;
  });
  // inline code
  out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // bold
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // links [text](url)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return out;
}

function argPreview(args: any): string {
  if (!args || typeof args !== "object") return "";
  if (typeof args.command === "string") return args.command;
  if (typeof args.path === "string") return args.path;
  if (typeof args.url === "string") return args.url;
  if (typeof args.query === "string") return args.query;
  const s = JSON.stringify(args);
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

export function MessageView({ message: m }: { message: StoredMessage }) {
  if (m._note === "info") {
    return (
      <div className="px-4 py-2 my-2 text-[12px] text-cyber-violet border-l-2 border-cyber-violet bg-[rgba(155,107,255,0.06)] tracking-wide">
        {m.content}
      </div>
    );
  }

  if (m._note === "error") {
    return (
      <div className="px-4 py-2 my-1 text-[13px] border-l-2 border-cyber-red bg-[rgba(255,77,109,0.06)] text-cyber-red">
        <span className="tag mr-2" style={{ color: "var(--red)" }}>
          error
        </span>
        {m.content}
      </div>
    );
  }

  if (m.role === "user") {
    return (
      <div className="px-4 py-3 group">
        <div className="flex gap-2">
          <span className="text-cyber-cyan select-none">{"❯"}</span>
          <div className="flex-1">
            {m.images?.length ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {m.images.map((im, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={`data:${im.mediaType};base64,${im.data}`}
                    alt="attachment"
                    className="max-h-44 rounded-sm border border-line-bright"
                  />
                ))}
              </div>
            ) : null}
            {m.content ? (
              <div className="stream-body text-ink whitespace-pre-wrap">
                {m.content}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (m.role === "tool") {
    return (
      <details className="mx-4 my-1 panel text-[12.5px]">
        <summary
          className="cursor-pointer px-3 py-1.5 flex items-center gap-2 list-none select-none"
          style={{ color: m.isError ? "var(--red)" : "var(--green)" }}
        >
          <span>{m.isError ? "✕" : "◀"}</span>
          <span className="tag" style={{ color: "inherit" }}>
            {m.toolName || "tool"}
          </span>
          <span className="text-ink-faint">result</span>
        </summary>
        <pre className="px-3 pb-3 pt-1 overflow-x-auto text-ink-dim whitespace-pre-wrap">
          {m.content}
        </pre>
      </details>
    );
  }

  // assistant
  return (
    <div className="px-4 py-2">
      {m.thinking ? (
        <details className="mb-2 text-[12px] text-ink-faint">
          <summary className="cursor-pointer select-none tag">
            thinking
          </summary>
          <div className="mt-1 pl-3 border-l border-line whitespace-pre-wrap">
            {m.thinking}
          </div>
        </details>
      ) : null}

      {m.content ? (
        <div
          className="stream-body leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
        />
      ) : null}

      {m.toolCalls?.length ? (
        <div className="mt-2 space-y-1">
          {m.toolCalls.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 text-[12.5px] text-cyber-sky"
            >
              <span className="text-cyber-violet">▶</span>
              <span className="font-medium">{c.name}</span>
              <span className="text-ink-faint truncate">
                {argPreview(c.arguments)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
