import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Google credential + token storage. Kept OUTSIDE the agent workspace (in
// ~/.amari by default) and never exposed to the browser. Server-only.
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleCreds {
  clientId: string;
  clientSecret: string;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry: number; // epoch ms
  scope?: string;
  token_type?: string;
  email?: string;
}

function configDir(): string {
  const override = process.env.AMARI_CONFIG_DIR?.trim();
  return override && override.length
    ? path.resolve(override)
    : path.join(os.homedir(), ".amari");
}
const credsPath = () => path.join(configDir(), "google-creds.json");
const tokensPath = () => path.join(configDir(), "google-tokens.json");

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T;
  } catch {
    return null;
  }
}
async function writeJson(p: string, data: unknown) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export async function getCreds(): Promise<GoogleCreds | null> {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  return readJson<GoogleCreds>(credsPath());
}
export const saveCreds = (c: GoogleCreds) => writeJson(credsPath(), c);

export const getTokens = () => readJson<GoogleTokens>(tokensPath());
export const saveTokens = (t: GoogleTokens) => writeJson(tokensPath(), t);
export async function clearTokens() {
  try {
    await fs.unlink(tokensPath());
  } catch {
    /* already gone */
  }
}
