"use client";

import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

const POSITIONS = [
  { id: "br", label: "↘ bottom right" },
  { id: "bc", label: "↓ bottom center" },
  { id: "bl", label: "↙ bottom left" },
  { id: "tr", label: "↗ top right" },
  { id: "tl", label: "↖ top left" },
  { id: "cc", label: "• center" },
];

function textToPng(text: string): string {
  const font =
    "italic 64px 'Segoe Script', 'Snell Roundhand', 'Brush Script MT', cursive";
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const w = Math.max(80, Math.ceil(measure.measureText(text).width) + 48);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = 110;
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = "#0b1f3a";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 24, 60);
  return c.toDataURL("image/png");
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function SignPdf({
  file,
  onClose,
}: {
  file: File;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufRef = useRef<ArrayBuffer | null>(null);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [pageNum, setPageNum] = useState(1);
  const [pos, setPos] = useState("br");
  const [width, setWidth] = useState(170);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    file.arrayBuffer().then(async (ab) => {
      bufRef.current = ab;
      try {
        const doc = await PDFDocument.load(ab);
        setPageCount(doc.getPageCount());
      } catch {
        /* leave at 1 */
      }
    });
  }, [file]);

  // signature drawing pad
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || mode !== "draw") return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f3a";
    let drawing = false;
    let last: { x: number; y: number } | null = null;
    const pt = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (cv.width / r.width),
        y: (e.clientY - r.top) * (cv.height / r.height),
      };
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      last = pt(e);
      cv.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drawing || !last) return;
      const p = pt(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      setHasDrawing(true);
    };
    const up = () => {
      drawing = false;
      last = null;
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [mode]);

  const clearPad = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) ctx.clearRect(0, 0, cv.width, cv.height);
    setHasDrawing(false);
  };

  const signatureBytes = (): Uint8Array | null => {
    if (mode === "draw") {
      if (!hasDrawing || !canvasRef.current) return null;
      return dataUrlToBytes(canvasRef.current.toDataURL("image/png"));
    }
    if (!typed.trim()) return null;
    return dataUrlToBytes(textToPng(typed.trim()));
  };

  const buildSigned = async (): Promise<Uint8Array | null> => {
    if (!bufRef.current) return null;
    const sig = signatureBytes();
    if (!sig) {
      setMsg(mode === "draw" ? "draw a signature first" : "type a name first");
      return null;
    }
    const doc = await PDFDocument.load(bufRef.current);
    const png = await doc.embedPng(sig);
    const pages = doc.getPages();
    const idx = Math.min(Math.max(pageNum - 1, 0), pages.length - 1);
    const page = pages[idx];
    const { width: pw, height: ph } = page.getSize();
    const w = width;
    const h = (w * png.height) / png.width;
    const m = 36;
    let x = pw - w - m;
    let y = m;
    if (pos === "bl") (x = m), (y = m);
    else if (pos === "bc") (x = (pw - w) / 2), (y = m);
    else if (pos === "tr") (x = pw - w - m), (y = ph - h - m);
    else if (pos === "tl") (x = m), (y = ph - h - m);
    else if (pos === "cc") (x = (pw - w) / 2), (y = (ph - h) / 2);
    page.drawImage(png, { x, y, width: w, height: h });
    return await doc.save();
  };

  const baseName = file.name.replace(/\.pdf$/i, "");

  const downloadSigned = async () => {
    setBusy(true);
    setMsg("");
    try {
      const bytes = await buildSigned();
      if (!bytes) return;
      const blob = new Blob([bytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}-signed.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMsg("downloaded ✓");
    } catch (e: any) {
      setMsg(`error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const saveToWorkspace = async () => {
    setBusy(true);
    setMsg("");
    try {
      const bytes = await buildSigned();
      if (!bytes) return;
      const fd = new FormData();
      fd.append(
        "file",
        new File([bytes as any], `${baseName}-signed.pdf`, {
          type: "application/pdf",
        }),
      );
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      setMsg(res.ok ? `saved to workspace/${data.path} ✓` : `error: ${data.error}`);
    } catch (e: any) {
      setMsg(`error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: "rgba(2,4,8,0.82)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="panel neon-border w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edge-accent flex items-center justify-between px-4 py-2.5 border-b border-line">
          <span className="glow-cyan font-bold tracking-widest text-[13px]">
            ✎ SIGN PDF
          </span>
          <button
            onClick={onClose}
            className="focus-ring px-2 text-ink-dim hover:text-cyber-cyan"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="flex gap-1.5">
            {(["draw", "type"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="focus-ring px-3 py-1 text-[12px] border"
                style={{
                  borderColor: mode === m ? "var(--cyan)" : "var(--line)",
                  color: mode === m ? "var(--cyan)" : "var(--ink-dim)",
                  background:
                    mode === m ? "rgba(0,229,255,0.06)" : "transparent",
                }}
              >
                {m}
              </button>
            ))}
            {mode === "draw" ? (
              <button
                onClick={clearPad}
                className="focus-ring ml-auto px-3 py-1 text-[11px] text-ink-faint hover:text-cyber-red"
              >
                clear
              </button>
            ) : null}
          </div>

          {mode === "draw" ? (
            <canvas
              ref={canvasRef}
              width={460}
              height={150}
              className="w-full rounded-sm touch-none"
              style={{
                background: "#f3f6fb",
                border: "1px solid var(--line-bright)",
                cursor: "crosshair",
              }}
            />
          ) : (
            <div>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="type your name"
                className="focus-ring w-full bg-bg-soft border border-line px-3 py-2 text-[13px]"
              />
              {typed.trim() ? (
                <div
                  className="mt-2 h-16 grid place-items-center rounded-sm"
                  style={{ background: "#f3f6fb" }}
                >
                  <span
                    style={{
                      color: "#0b1f3a",
                      fontFamily:
                        "'Segoe Script','Snell Roundhand','Brush Script MT',cursive",
                      fontStyle: "italic",
                      fontSize: 32,
                    }}
                  >
                    {typed}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] text-ink-dim">
              page
              <select
                value={pageNum}
                onChange={(e) => setPageNum(Number(e.target.value))}
                className="focus-ring mt-1 w-full bg-bg-soft border border-line px-2 py-1.5"
              >
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} / {pageCount}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-ink-dim">
              position
              <select
                value={pos}
                onChange={(e) => setPos(e.target.value)}
                className="focus-ring mt-1 w-full bg-bg-soft border border-line px-2 py-1.5"
              >
                {POSITIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-[12px] text-ink-dim">
            size: {width}px
            <input
              type="range"
              min={80}
              max={320}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-full mt-1 accent-cyan-400"
              style={{ accentColor: "var(--cyan)" }}
            />
          </label>

          {msg ? (
            <p
              className="text-[11.5px]"
              style={{
                color: msg.startsWith("error") ? "var(--red)" : "var(--green)",
              }}
            >
              {msg}
            </p>
          ) : null}
        </div>

        <div className="px-4 py-3 border-t border-line flex gap-2 justify-end">
          <button
            onClick={saveToWorkspace}
            disabled={busy}
            className="focus-ring px-3 py-1.5 text-[12px] border border-line text-ink-dim hover:text-cyber-cyan disabled:opacity-50"
          >
            save to workspace
          </button>
          <button
            onClick={downloadSigned}
            disabled={busy}
            className="focus-ring px-4 py-1.5 text-[12px] border border-cyber-cyan text-cyber-cyan hover:shadow-glow disabled:opacity-50"
          >
            {busy ? "…" : "apply & download"}
          </button>
        </div>
      </div>
    </div>
  );
}
