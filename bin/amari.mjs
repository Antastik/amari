#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Amari launcher — starts the dev server and opens it in your browser.
// Works on macOS, Windows and Linux. Usage: `npm run launch` or `npx amari`.
// For a production build instead, run `npm run build && npm run start`.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const port = process.env.PORT || "4173";

const nextBin = path.join(root, "node_modules", ".bin", isWin ? "next.cmd" : "next");
if (!existsSync(nextBin)) {
  console.error(
    "Amari: dependencies not installed. Run `npm install` (or pnpm install) first.",
  );
  process.exit(1);
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : isWin
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, isWin ? ["", url] : [url], {
      shell: isWin,
      stdio: "ignore",
      detached: true,
    }).unref();
  } catch {
    /* user can open it manually */
  }
}

const url = `http://localhost:${port}`;
console.log(`\n  ◈ AMARI — launching at ${url}\n`);

const child = spawn(nextBin, ["dev", "-p", port], {
  cwd: root,
  stdio: "inherit",
  shell: isWin,
  env: process.env,
});

const timer = setTimeout(() => openBrowser(url), 3000);

child.on("close", (code) => {
  clearTimeout(timer);
  process.exit(code ?? 0);
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
