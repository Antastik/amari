"use client";

import { useEffect, useState } from "react";
import { SignPdf } from "./SignPdf";

type Parsed =
  | { kind: "sheet"; name: string; size: number; sheets: { name: string; html: string; csv: string }[] }
  | { kind: "html"; name: string; size: number; html: string }
  | { kind: "pdf"; name: string; size: number; text: string; pageCount: number }
  | { kind: "text"; name: string; size: number; text: string }
  | { kind: "image"; name: string; size: number }
  | { kind: "unknown"; name: string; size: number; text: string }
  | { error: string };

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FileViewer({
  file,
  onClose,
}: {
  file: File;
  onClose: () => void;
}) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState(0);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const lower = file.name.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(lower);

  useEffect(() => {
    let url: string | null = null;
    setParsed(null);
    setLoading(true);
    setActiveSheet(0);

    if (isPdf || isImage) {
      url = URL.createObjectURL(file);
      setObjectUrl(url);
      setLoading(false);
    } else {
      const fd = new FormData();
      fd.append("file", file);
      fetch("/api/parse", { method: "POST", body: fd })
        .then((r) => r.json())
        .then((d) => setParsed(d))
        .catch((e) => setParsed({ error: String(e) }))
        .finally(() => setLoading(false));
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const download = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-stretch md:items-start justify-center p-0 md:p-6"
      style={{ background: "rgba(2,4,8,0.8)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="panel neon-border w-full max-w-5xl flex flex-col md:my-2"
        style={{ height: "100%", maxHeight: "96vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edge-accent flex items-center gap-3 px-4 py-2.5 border-b border-line">
          <span className="text-cyber-violet">▣</span>
          <div className="min-w-0 flex-1">
            <div className="text-ink truncate text-[13px]">{file.name}</div>
            <div className="tag">
              viewer · {fmtSize(file.size)}
              {parsed && "pageCount" in parsed
                ? ` · ${parsed.pageCount} pages`
                : ""}
            </div>
          </div>
          {isPdf ? (
            <button
              onClick={() => setSigning(true)}
              className="focus-ring px-3 py-1 text-[12px] border border-cyber-violet text-cyber-violet hover:shadow-glow"
            >
              ✎ sign
            </button>
          ) : null}
          <button
            onClick={download}
            className="focus-ring px-3 py-1 text-[12px] border border-line text-ink-dim hover:text-cyber-cyan"
          >
            ↓ save
          </button>
          <button
            onClick={onClose}
            className="focus-ring px-2 text-ink-dim hover:text-cyber-cyan"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-bg">
          {loading ? (
            <div className="h-full grid place-items-center text-ink-faint cursor-blink">
              parsing
            </div>
          ) : isImage && objectUrl ? (
            <div className="h-full grid place-items-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objectUrl}
                alt={file.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : isPdf && objectUrl ? (
            <iframe
              src={objectUrl}
              title={file.name}
              className="w-full h-full bg-white"
            />
          ) : parsed && "error" in parsed ? (
            <div className="p-4 text-cyber-red text-[13px]">
              Could not parse: {parsed.error}
            </div>
          ) : parsed?.kind === "sheet" ? (
            <div className="flex flex-col h-full">
              <div className="flex gap-1 px-3 py-2 border-b border-line overflow-x-auto shrink-0">
                {parsed.sheets.map((s, i) => (
                  <button
                    key={s.name + i}
                    onClick={() => setActiveSheet(i)}
                    className="focus-ring px-3 py-1 text-[12px] whitespace-nowrap border"
                    style={{
                      borderColor:
                        i === activeSheet ? "var(--cyan)" : "var(--line)",
                      color: i === activeSheet ? "var(--cyan)" : "var(--ink-dim)",
                      background:
                        i === activeSheet
                          ? "rgba(0,229,255,0.06)"
                          : "transparent",
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <div
                className="sheet-html flex-1 overflow-auto p-3"
                dangerouslySetInnerHTML={{
                  __html: parsed.sheets[activeSheet]?.html || "",
                }}
              />
            </div>
          ) : parsed?.kind === "html" ? (
            <div
              className="doc-html max-w-3xl mx-auto p-6"
              dangerouslySetInnerHTML={{ __html: parsed.html }}
            />
          ) : parsed && "text" in parsed ? (
            <pre className="p-4 text-[12.5px] text-ink whitespace-pre-wrap break-words">
              {parsed.text}
            </pre>
          ) : (
            <div className="p-4 text-ink-faint">Nothing to display.</div>
          )}
        </div>
      </div>

      {signing ? (
        <SignPdf file={file} onClose={() => setSigning(false)} />
      ) : null}
    </div>
  );
}
