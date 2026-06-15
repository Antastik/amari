// Thin Google Drive + Gmail REST helpers (read-only). Server-only.

async function gfetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Google API ${res.status}: ${body}`);
  }
  return res;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export async function driveSearch(
  token: string,
  query: string,
  max = 15,
): Promise<DriveFile[]> {
  const q = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed=false`;
  const params = new URLSearchParams({
    q,
    pageSize: String(max),
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
    orderBy: "modifiedTime desc",
  });
  const res = await gfetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    token,
  );
  return (await res.json()).files ?? [];
}

export async function driveRead(
  token: string,
  fileId: string,
): Promise<{ name: string; text: string }> {
  const meta: any = await (
    await gfetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
      token,
    )
  ).json();
  const mt: string = meta.mimeType || "";
  if (mt.startsWith("application/vnd.google-apps.")) {
    const exportMime = mt.includes("spreadsheet")
      ? "text/csv"
      : "text/plain";
    const res = await gfetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(
        exportMime,
      )}`,
      token,
    );
    return { name: meta.name, text: await res.text() };
  }
  const res = await gfetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    token,
  );
  return { name: meta.name, text: await res.text() };
}

function decodeB64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeB64Url(payload.body.data);
  if (Array.isArray(payload.parts)) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain?.body?.data) return decodeB64Url(plain.body.data);
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (html?.body?.data)
      return decodeB64Url(html.body.data).replace(/<[^>]+>/g, " ");
    for (const p of payload.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  return "";
}

export interface GmailSummary {
  id: string;
  from?: string;
  subject?: string;
  date?: string;
  snippet?: string;
}

export async function gmailSearch(
  token: string,
  query: string,
  max = 12,
): Promise<GmailSummary[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(max) });
  const list: any = await (
    await gfetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      token,
    )
  ).json();
  const msgs: any[] = list.messages ?? [];
  const out: GmailSummary[] = [];
  for (const m of msgs.slice(0, max)) {
    const d: any = await (
      await gfetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      )
    ).json();
    const h: Record<string, string> = {};
    for (const x of d.payload?.headers ?? []) h[x.name] = x.value;
    out.push({
      id: m.id,
      from: h.From,
      subject: h.Subject,
      date: h.Date,
      snippet: d.snippet,
    });
  }
  return out;
}

export async function gmailRead(
  token: string,
  messageId: string,
): Promise<{
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body: string;
}> {
  const d: any = await (
    await gfetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      token,
    )
  ).json();
  const h: Record<string, string> = {};
  for (const x of d.payload?.headers ?? []) h[x.name] = x.value;
  return {
    from: h.From,
    to: h.To,
    subject: h.Subject,
    date: h.Date,
    body: extractBody(d.payload),
  };
}
