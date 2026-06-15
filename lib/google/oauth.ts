import {
  getCreds,
  getTokens,
  saveTokens,
  type GoogleTokens,
} from "./store";

// OAuth 2.0 authorization-code flow against Google. The client secret and
// tokens stay server-side; the browser only ever triggers a redirect.

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export async function buildAuthUrl(origin: string): Promise<string | null> {
  const creds = await getCreds();
  if (!creds) return null;
  const p = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeCode(
  code: string,
  origin: string,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await getCreds();
  if (!creds) return { ok: false, error: "Google credentials not configured" };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    return { ok: false, error: `token exchange failed (${res.status})` };
  }
  const d: any = await res.json();
  const tokens: GoogleTokens = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expiry: Date.now() + (d.expires_in ?? 3600) * 1000,
    scope: d.scope,
    token_type: d.token_type,
  };
  try {
    const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${d.access_token}` },
    });
    if (ui.ok) tokens.email = (await ui.json()).email;
  } catch {
    /* email is cosmetic */
  }
  await saveTokens(tokens);
  return { ok: true };
}

async function refresh(): Promise<string | null> {
  const creds = await getCreds();
  const t = await getTokens();
  if (!creds || !t?.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: t.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const d: any = await res.json();
  await saveTokens({
    ...t,
    access_token: d.access_token,
    expiry: Date.now() + (d.expires_in ?? 3600) * 1000,
  });
  return d.access_token;
}

/** Returns a fresh access token, refreshing if needed, or null if not connected. */
export async function getValidAccessToken(): Promise<string | null> {
  const t = await getTokens();
  if (!t) return null;
  if (Date.now() < t.expiry - 60_000) return t.access_token;
  return refresh();
}

export async function getStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  email?: string;
}> {
  const [creds, t] = await Promise.all([getCreds(), getTokens()]);
  return { configured: !!creds, connected: !!t, email: t?.email };
}
