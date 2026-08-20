// Backup & restore edge function.
// A pending row in public.backup_requests is created every 10 days by cron
// (and notifies both master admins for approval and all members as a heads-up).
// A master admin approves it here, which triggers the actual snapshot.
// After 24h without a decision, the auto-approve hook calls this function
// with the service-role bearer + { auto_approve_pending: true } and it runs.
//
// Body variants:
//   { manual: true }                     — master admin immediate snapshot
//   { approve_request_id: "<uuid>" }     — master admin approves a pending request → snapshot
//   { reject_request_id: "<uuid>" }      — master admin rejects a pending request
//   { restore: true, file: "backup-...json" } — master admin restore (data only)
//   { delete: true, file: "backup-...json" } — master admin delete a backup file
//   { sync_to_drive: true, file: "..." } — master admin: push an existing backup to Google Drive
//   { drive_status: true }               — master admin: Drive config + remote file list
//   { auto_approve_pending: true }       — service-role only: snapshot any pending >24h
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  BlobWriter, TextReader, Uint8ArrayReader, ZipWriter,
} from "https://esm.sh/@zip.js/zip.js@2.7.45";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "content-type": "application/json" },
  });
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (parts.length) return parts.join(" — ");
    try { return JSON.stringify(o); } catch { /* ignore */ }
  }
  return String(e);
}


// Full list of tables captured by the snapshot. Restore is handled by the
// SQL function public.restore_full_snapshot(payload) which has its own
// authoritative table list — keep it in sync when you add new tables here.
// `backup_requests` is intentionally excluded (control log).
const TABLES = [
  "app_config", "financial_settings", "profiles", "projects", "references",
  "league_seasons", "invites", "share_links", "customers", "expense_categories",
  "fx_rates", "invoices", "invoice_items", "invoice_payments", "expenses",
  "income_entries", "subscriptions_income", "subscriptions_expense",
  "payroll_periods", "payroll_entries", "member_salary_settings",
  "finance_reminders_log", "note_folders", "note_tags", "notes", "note_tag_links",
  "note_shares", "note_comments", "note_attachments", "tasks", "task_assignees",
  "task_files", "task_comments", "task_point_awards", "work_sessions",
  "season_scores", "user_badges", "member_reports", "activity_log",
  "notifications", "user_sessions",
];

// Storage buckets to mirror alongside the DB snapshot.
// The `backups` bucket is the destination — never mirror it into itself.
const FILE_BUCKETS = [
  "invoices",
  "member-reports",
  "expense-receipts",
  "note-attachments",
];

// Safety cap per file to avoid memory blowups inside the edge function.
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

// ─────────────────────────────────────────────────────────────
// Google Drive sync (service account / JWT flow)
// env: GOOGLE_DRIVE_SA_JSON, GOOGLE_DRIVE_FOLDER_ID
// A service account has no Drive quota of its own, so the destination folder
// must be shared with its email from a real account (or be a Shared Drive).
// ─────────────────────────────────────────────────────────────
const DRIVE_KEEP = 12;

type DriveFile = { id: string; name: string; createdTime?: string; webViewLink?: string; size?: string };
type ZipEntry = { path: string; bytes: Uint8Array };

type ServiceAccount = { client_email: string; private_key: string };
type DriveCfg = {
  mode: "service_account" | "oauth";
  sa?: ServiceAccount;
  refreshToken?: string;
  accountEmail?: string | null;
  folderId: string;
  folderName?: string | null;
};
type DriveTarget = { id: string | null; folder_id: string; folder_name: string | null; keep: number };

// Loaded per request from public.drive_config (falls back to env vars).
let DRIVE_CFG: DriveCfg | null = null;
let DRIVE_TARGETS: DriveTarget[] = [];

function driveConfigured(): boolean {
  return !!DRIVE_CFG;
}

function driveFolderId(): string {
  return DRIVE_TARGETS[0]?.folder_id ?? DRIVE_CFG?.folderId ?? "";
}

function driveOwner(): string {
  return DRIVE_CFG?.mode === "oauth"
    ? `oauth:${DRIVE_CFG.accountEmail ?? "user"}`
    : `sa:${DRIVE_CFG?.sa?.client_email ?? ""}`;
}


// ---- at-rest encryption for the service-account JSON ----
async function vaultKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`drive-vault:${secret}`));
  return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptText(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultKey();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const merged = new Uint8Array(iv.length + ct.length);
  merged.set(iv, 0);
  merged.set(ct, iv.length);
  return toB64(merged);
}

async function decryptText(b64: string): Promise<string> {
  const raw = fromB64(b64);
  const key = await vaultKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12),
  );
  return new TextDecoder().decode(plain);
}

function normalizeFolderId(input: string): string {
  const s = (input ?? "").trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) ?? s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return s.replace(/^https?:\/\/\S*\//, "").replace(/[?#].*$/, "");
}

// deno-lint-ignore no-explicit-any
async function loadDriveConfig(sb: any): Promise<{ dbError?: string }> {
  DRIVE_CFG = null;
  DRIVE_TARGETS = [];
  let dbError: string | undefined;
  try {
    const { data } = await sb.from("drive_config").select("*").eq("id", true).maybeSingle();
    if (data?.auth_mode === "oauth" && data?.refresh_token_enc) {
      try {
        DRIVE_CFG = {
          mode: "oauth",
          refreshToken: await decryptText(data.refresh_token_enc),
          accountEmail: data.account_email ?? null,
          folderId: data.folder_id ?? "",
          folderName: data.folder_name ?? null,
        };
      } catch (e) {
        dbError = `stored credentials unreadable: ${errMsg(e)}`;
      }
    } else if (data?.sa_json_enc) {
      try {
        const sa = JSON.parse(await decryptText(data.sa_json_enc)) as ServiceAccount;
        DRIVE_CFG = {
          mode: "service_account",
          sa,
          accountEmail: data.client_email ?? sa.client_email,
          folderId: data.folder_id ?? "",
          folderName: data.folder_name ?? null,
        };
      } catch (e) {
        dbError = `stored credentials unreadable: ${errMsg(e)}`;
      }
    }
  } catch (e) {
    dbError = errMsg(e);
  }

  if (!DRIVE_CFG) {
    const envRaw = Deno.env.get("GOOGLE_DRIVE_SA_JSON");
    const envFolder = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
    if (envRaw && envFolder) {
      try {
        const sa = JSON.parse(envRaw) as ServiceAccount;
        DRIVE_CFG = { mode: "service_account", sa, accountEmail: sa.client_email, folderId: envFolder };
      } catch (e) {
        dbError = `env service account invalid: ${errMsg(e)}`;
      }
    }
  }

  if (DRIVE_CFG) {
    try {
      const { data: rows } = await sb.from("drive_targets")
        .select("id, folder_id, folder_name, keep, enabled")
        .eq("enabled", true)
        .order("created_at", { ascending: true });
      DRIVE_TARGETS = (rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        folder_id: r.folder_id as string,
        folder_name: (r.folder_name as string) ?? null,
        keep: Number(r.keep ?? DRIVE_KEEP) || DRIVE_KEEP,
      }));
    } catch (_) { /* table may not exist yet */ }
    if (!DRIVE_TARGETS.length && DRIVE_CFG.folderId) {
      DRIVE_TARGETS = [{
        id: null,
        folder_id: DRIVE_CFG.folderId,
        folder_name: DRIVE_CFG.folderName ?? null,
        keep: DRIVE_KEEP,
      }];
    }
    // Without any destination folder the credentials are useless.
    if (!DRIVE_TARGETS.length) DRIVE_CFG = null;
  }
  return dbError ? { dbError } : {};
}

async function driveFolderInfo(id: string): Promise<{ id: string; name: string }> {
  const token = await driveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`drive folder [${res.status}]: ${text}`);
  return JSON.parse(text) as { id: string; name: string };
}


function b64url(input: Uint8Array | string): string {
  const raw = typeof input === "string"
    ? input
    : Array.from(input).map((b) => String.fromCharCode(b)).join("");
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let driveToken: { token: string; exp: number; owner: string } | null = null;

async function oauthAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) throw new Error("oauth_not_configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`google refresh [${res.status}]: ${text}`);
  return JSON.parse(text) as { access_token: string; expires_in: number };
}

async function driveAccessToken(): Promise<string> {
  if (!DRIVE_CFG) throw new Error("drive_not_configured");
  const owner = driveOwner();
  if (driveToken && driveToken.owner === owner && driveToken.exp > Date.now() + 60_000) {
    return driveToken.token;
  }

  if (DRIVE_CFG.mode === "oauth") {
    const parsed = await oauthAccessToken(DRIVE_CFG.refreshToken ?? "");
    driveToken = { token: parsed.access_token, exp: Date.now() + parsed.expires_in * 1000, owner };
    return parsed.access_token;
  }

  const sa = DRIVE_CFG.sa;
  if (!sa?.client_email || !sa?.private_key) throw new Error("drive_not_configured");
  const pk = sa.private_key.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(pk),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`google token [${res.status}]: ${text}`);
  const parsed = JSON.parse(text) as { access_token: string; expires_in: number };
  driveToken = { token: parsed.access_token, exp: Date.now() + parsed.expires_in * 1000, owner };
  return parsed.access_token;
}

async function driveUpload(name: string, blob: Blob, folderId: string): Promise<DriveFile> {
  const token = await driveAccessToken();
  const boundary = `mechatro-${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name, parents: [folderId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\ncontent-type: application/zip\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Blob([head, blob, tail]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,createdTime,webViewLink,size",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`drive upload [${res.status}]: ${text}`);
  return JSON.parse(text) as DriveFile;
}

async function driveList(folderId = driveFolderId()): Promise<DriveFile[]> {
  const token = await driveAccessToken();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=100` +
    `&fields=files(id,name,createdTime,webViewLink,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`drive list [${res.status}]: ${text}`);
  return (JSON.parse(text) as { files?: DriveFile[] }).files ?? [];
}

// Folders the connected account can write to (for the in-app folder picker).
async function driveListFolders(parent?: string, search?: string): Promise<DriveFile[]> {
  const token = await driveAccessToken();
  const clauses = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (parent) clauses.push(`'${parent}' in parents`);
  if (search) clauses.push(`name contains '${search.replace(/'/g, "\\'")}'`);
  const q = encodeURIComponent(clauses.join(" and "));
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&pageSize=100` +
    `&fields=files(id,name,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`drive folders [${res.status}]: ${text}`);
  return (JSON.parse(text) as { files?: DriveFile[] }).files ?? [];
}

async function driveCreateFolder(name: string, parent?: string): Promise<DriveFile> {
  const token = await driveAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parent ? { parents: [parent] } : {}),
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`drive create folder [${res.status}]: ${text}`);
  return JSON.parse(text) as DriveFile;
}

async function driveDelete(id: string): Promise<void> {
  const token = await driveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`,
    { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 404) throw new Error(`drive delete [${res.status}]: ${await res.text()}`);
}

async function drivePrune(keep: number, folderId: string): Promise<number> {
  const files = await driveList(folderId);
  const stale = files.slice(keep);
  for (const f of stale) {
    try { await driveDelete(f.id); } catch (e) { console.warn("drive prune", errMsg(e)); }
  }
  return stale.length;
}


async function buildZip(dbJson: string, entries: ZipEntry[]): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter("application/zip"), { level: 6 });
  await writer.add("database.json", new TextReader(dbJson));
  for (const e of entries) {
    try {
      await writer.add(`files/${e.path}`, new Uint8ArrayReader(e.bytes));
    } catch (err) {
      console.warn(`zip entry ${e.path}: ${errMsg(err)}`);
    }
  }
  return await writer.close();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, serviceKey);

  let body: {
    manual?: boolean;
    restore?: boolean;
    restore_inline?: boolean;
    payload?: unknown;
    delete?: boolean;
    file?: string;
    approve_request_id?: string;
    reject_request_id?: string;
    auto_approve_pending?: boolean;
    sync_to_drive?: boolean;
    drive_status?: boolean;
    drive_connect?: boolean;
    drive_disconnect?: boolean;
    sa_json?: string;
    folder?: string;
  } = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  const driveLoad = await loadDriveConfig(sb);


  // ---- Auth: master admin OR service-role bearer (system) ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing token" });

  const isSystem = token === serviceKey;
  let actorId: string | null = null;

  if (!isSystem) {
    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userRes.user) return json(401, { error: "invalid token" });
    const { data: me } = await sb.from("profiles")
      .select("id, is_master_admin").eq("id", userRes.user.id).maybeSingle();
    if (!me?.is_master_admin) return json(403, { error: "master admin only" });
    actorId = me.id;
  }

  async function listBucketRecursive(bucket: string, prefix = ""): Promise<string[]> {
    const out: string[] = [];
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.warn(`list ${bucket}:${prefix} → ${error.message}`);
      return out;
    }
    for (const item of data ?? []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      // In Supabase Storage, folder entries have a null id.
      const isFolder = (item as { id: string | null }).id === null;
      if (isFolder) {
        const nested = await listBucketRecursive(bucket, full);
        out.push(...nested);
      } else {
        out.push(full);
      }
    }
    return out;
  }

  async function mirrorBucketFiles(
    stamp: string,
    collect?: ZipEntry[],
  ): Promise<{ mirrored: number; skipped: number; errors: number }> {
    let mirrored = 0, skipped = 0, errors = 0;
    for (const bucket of FILE_BUCKETS) {
      let paths: string[] = [];
      try {
        paths = await listBucketRecursive(bucket, "");
      } catch (e) {
        console.warn(`list bucket ${bucket} failed: ${errMsg(e)}`);
        errors += 1;
        continue;
      }
      for (const p of paths) {
        try {
          const { data: dl, error: dlErr } = await sb.storage.from(bucket).download(p);
          if (dlErr || !dl) { errors += 1; continue; }
          if (dl.size > MAX_FILE_BYTES) { skipped += 1; continue; }
          const buf = new Uint8Array(await dl.arrayBuffer());
          const dest = `snapshot-${stamp}/${bucket}/${p}`;
          const { error: upErr } = await sb.storage.from("backups").upload(dest, buf, {
            contentType: dl.type || "application/octet-stream",
            upsert: true,
          });
          if (upErr) { errors += 1; continue; }
          collect?.push({ path: `${bucket}/${p}`, bytes: buf });
          mirrored += 1;
        } catch (e) {
          console.warn(`mirror ${bucket}/${p} → ${errMsg(e)}`);
          errors += 1;
        }
      }
    }
    return { mirrored, skipped, errors };
  }

  async function pruneOldFileSnapshots(keepStamps: string[]) {
    // Delete any `snapshot-*` folders whose stamp isn't in keepStamps.
    const { data: top } = await sb.storage.from("backups").list("", { limit: 1000 });
    const staleRoots = (top ?? [])
      .filter((f) => f.name.startsWith("snapshot-") && !keepStamps.includes(f.name.replace(/^snapshot-/, "")));
    for (const root of staleRoots) {
      const stack: string[] = [root.name];
      const toRemove: string[] = [];
      while (stack.length) {
        const dir = stack.pop()!;
        const { data: items } = await sb.storage.from("backups").list(dir, { limit: 1000 });
        for (const it of items ?? []) {
          const full = `${dir}/${it.name}`;
          if ((it as { id: string | null }).id === null) stack.push(full);
          else toRemove.push(full);
        }
      }
      if (toRemove.length) {
        // Supabase remove() accepts up to ~1000 paths per call; chunk defensively.
        for (let i = 0; i < toRemove.length; i += 500) {
          await sb.storage.from("backups").remove(toRemove.slice(i, i + 500));
        }
      }
    }
  }

  async function recordDriveRow(row: Record<string, unknown>) {
    const q = sb.from("backup_drive_files").delete().eq("file", row.file);
    if (row.target_id) await q.eq("target_id", row.target_id);
    else await q.is("target_id", null);
    await sb.from("backup_drive_files").insert(row);
  }

  // Build the single archive for a backup and push it to every enabled Drive folder.
  // Best-effort: never fails the surrounding snapshot.
  async function syncToDrive(
    backupFile: string,
    dbJson: string,
    entries: ZipEntry[],
  ): Promise<{
    ok: boolean; skipped?: boolean; error?: string; link?: string;
    targets?: Array<{ folder_id: string; folder_name: string | null; ok: boolean; link?: string; error?: string }>;
  }> {
    if (!driveConfigured() || !DRIVE_TARGETS.length) return { ok: false, skipped: true };
    const stamp = backupFile.replace(/^backup-/, "").replace(/\.json$/, "");
    const name = `mechatro-backup-${stamp}.zip`;
    let blob: Blob;
    try {
      blob = await buildZip(dbJson, entries);
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }

    const results: Array<{ folder_id: string; folder_name: string | null; ok: boolean; link?: string; error?: string }> = [];
    for (const target of DRIVE_TARGETS) {
      try {
        const uploaded = await driveUpload(name, blob, target.folder_id);
        await drivePrune(target.keep || DRIVE_KEEP, target.folder_id);
        await recordDriveRow({
          file: backupFile,
          target_id: target.id,
          drive_file_id: uploaded.id,
          drive_name: uploaded.name,
          drive_link: uploaded.webViewLink ?? null,
          size_bytes: uploaded.size ? Number(uploaded.size) : blob.size,
          synced_at: new Date().toISOString(),
          error: null,
        });
        if (target.id) {
          await sb.from("drive_targets")
            .update({ last_synced_at: new Date().toISOString(), last_error: null })
            .eq("id", target.id);
        }
        results.push({ folder_id: target.folder_id, folder_name: target.folder_name, ok: true, link: uploaded.webViewLink });
      } catch (e) {
        const msg = errMsg(e);
        console.error("drive sync failed", target.folder_id, msg);
        try {
          await recordDriveRow({ file: backupFile, target_id: target.id, synced_at: null, error: msg });
          if (target.id) await sb.from("drive_targets").update({ last_error: msg }).eq("id", target.id);
        } catch (_) { /* ignore */ }
        results.push({ folder_id: target.folder_id, folder_name: target.folder_name, ok: false, error: msg });
      }
    }
    const okOne = results.find((r) => r.ok);
    return {
      ok: !!okOne,
      link: okOne?.link,
      error: okOne ? undefined : results[0]?.error,
      targets: results,
    };
  }


  // Rebuild the archive for an already stored backup and push it to Drive.
  async function syncExistingToDrive(backupFile: string) {
    const { data: dl, error: dlErr } = await sb.storage.from("backups").download(backupFile);
    if (dlErr || !dl) throw new Error(dlErr?.message ?? "download failed");
    const dbJson = await dl.text();
    const stamp = backupFile.replace(/^backup-/, "").replace(/\.json$/, "");
    const mirrorRoot = `snapshot-${stamp}`;
    const entries: ZipEntry[] = [];
    for (const bucket of FILE_BUCKETS) {
      let paths: string[] = [];
      try { paths = await listBucketRecursive("backups", `${mirrorRoot}/${bucket}`); } catch (_) { continue; }
      for (const full of paths) {
        try {
          const { data: f } = await sb.storage.from("backups").download(full);
          if (!f || f.size > MAX_FILE_BYTES) continue;
          entries.push({ path: full.slice(`${mirrorRoot}/`.length), bytes: new Uint8Array(await f.arrayBuffer()) });
        } catch (_) { /* skip */ }
      }
    }
    return await syncToDrive(backupFile, dbJson, entries);
  }

  async function runSnapshot(requestId: string | null, systemDecision = false) {
    const snapshot: Record<string, unknown[]> = {};
    for (const t of TABLES) {
      const { data, error } = await sb.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      snapshot[t] = data ?? [];
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${stamp}.json`;
    const dbJson = JSON.stringify(snapshot, null, 2);
    const payload = new TextEncoder().encode(dbJson);
    const { error: upErr } = await sb.storage.from("backups").upload(filename, payload, {
      contentType: "application/json", upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    // Mirror storage buckets for cold recovery (files not restored, but preserved).
    const zipEntries: ZipEntry[] = [];
    const fileStats = await mirrorBucketFiles(stamp, driveConfigured() ? zipEntries : undefined);

    // Push a single compressed archive to Google Drive (best-effort).
    const drive = await syncToDrive(filename, dbJson, zipEntries);

    // Retain last 12 backups (DB JSON + matching file folder).
    const { data: list } = await sb.storage.from("backups").list("", {
      limit: 500, sortBy: { column: "created_at", order: "desc" },
    });
    const jsonBackups = (list ?? []).filter((f) => f.name.endsWith(".json"));
    const keepJson = jsonBackups.slice(0, 12).map((f) => f.name);
    const staleJson = jsonBackups.slice(12).map((f) => f.name);
    if (staleJson.length) await sb.storage.from("backups").remove(staleJson);

    const keepStamps = keepJson.map((n) => n.replace(/^backup-/, "").replace(/\.json$/, ""));
    await pruneOldFileSnapshots(keepStamps);

    if (requestId) {
      await sb.from("backup_requests").update({
        status: "completed",
        decided_by: systemDecision ? null : actorId,
        decided_at: new Date().toISOString(),
        result_file: filename,
      }).eq("id", requestId);
    }

    return {
      ok: true,
      file: filename,
      tables: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])),
      files: fileStats,
      drive,
    };
  }

  try {
    // ---- Auto-approve pending requests older than 24h (system only) ----
    if (body.auto_approve_pending) {
      if (!isSystem) return json(403, { error: "system only" });
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: due, error: dueErr } = await sb.from("backup_requests")
        .select("id, requested_at")
        .eq("status", "pending")
        .lt("requested_at", cutoff)
        .order("requested_at", { ascending: true });
      if (dueErr) throw new Error(dueErr.message);
      const results: Array<{ id: string; ok: boolean; error?: string; file?: string }> = [];
      // Only run one snapshot per invocation to keep function runtime bounded.
      const first = (due ?? [])[0];
      if (first) {
        try {
          const res = await runSnapshot(first.id, true);
          results.push({ id: first.id, ok: true, file: res.file });
        } catch (e) {
          const msg = errMsg(e);
          console.error("auto-approve snapshot failed", e);
          await sb.from("backup_requests").update({
            status: "failed",
            decided_by: null,
            decided_at: new Date().toISOString(),
            error: msg,
          }).eq("id", first.id);
          results.push({ id: first.id, ok: false, error: msg });
        }
      }
      return json(200, { ok: true, processed: results.length, results });
    }

    // ---- Google Drive: connect (upload service account + folder) ----
    if (body.drive_connect) {
      if (isSystem) return json(403, { error: "user only" });
      let sa: ServiceAccount;
      try {
        sa = JSON.parse(body.sa_json ?? "") as ServiceAccount;
      } catch (_) {
        return json(400, { error: "invalid_sa_json" });
      }
      if (!sa?.client_email || !sa?.private_key) return json(400, { error: "invalid_sa_json" });

      const folderId = normalizeFolderId(body.folder ?? "");
      if (!folderId || folderId.length < 10) return json(400, { error: "bad_folder_id" });

      // Probe with the submitted credentials before persisting anything.
      DRIVE_CFG = { sa, folderId };
      driveToken = null;
      let folderName = "";
      try {
        const info = await driveFolderInfo(folderId);
        folderName = info.name;
      } catch (e) {
        DRIVE_CFG = null;
        driveToken = null;
        const msg = errMsg(e);
        let code = "drive_connect_failed";
        if (/accessNotConfigured|has not been used|is disabled/i.test(msg)) code = "drive_api_disabled";
        else if (/\[404\]|notFound/i.test(msg)) code = "folder_not_shared";
        else if (/\[403\]|insufficient|forbidden/i.test(msg)) code = "folder_not_shared";
        else if (/invalid_grant|Invalid JWT|unauthorized_client/i.test(msg)) code = "invalid_credentials";
        await sb.from("drive_config").upsert({ id: true, last_error: msg }, { onConflict: "id" });
        return json(400, { error: code, detail: msg, client_email: sa.client_email });
      }

      const enc = await encryptText(JSON.stringify({ client_email: sa.client_email, private_key: sa.private_key }));
      const { error: saveErr } = await sb.from("drive_config").upsert({
        id: true,
        client_email: sa.client_email,
        folder_id: folderId,
        folder_name: folderName,
        sa_json_enc: enc,
        connected_at: new Date().toISOString(),
        connected_by: actorId,
        last_error: null,
      }, { onConflict: "id" });
      if (saveErr) return json(500, { error: saveErr.message });

      let files: DriveFile[] = [];
      try { files = await driveList(); } catch (_) { /* ignore */ }
      return json(200, {
        ok: true, configured: true,
        client_email: sa.client_email, folder_id: folderId, folder_name: folderName, files,
      });
    }

    // ---- Google Drive: disconnect ----
    if (body.drive_disconnect) {
      if (isSystem) return json(403, { error: "user only" });
      const { error } = await sb.from("drive_config").delete().eq("id", true);
      if (error) return json(500, { error: error.message });
      DRIVE_CFG = null;
      driveToken = null;
      return json(200, { ok: true, configured: false, files: [] });
    }

    // ---- Google Drive status ----
    if (body.drive_status) {
      if (isSystem) return json(403, { error: "user only" });
      const { data: cfgRow } = await sb.from("drive_config")
        .select("client_email, folder_id, folder_name, connected_at, last_error")
        .eq("id", true).maybeSingle();
      if (!driveConfigured()) {
        return json(200, {
          ok: true, configured: false, files: [],
          error: driveLoad.dbError ?? cfgRow?.last_error ?? null,
        });
      }
      const base = {
        configured: true,
        client_email: cfgRow?.client_email ?? DRIVE_CFG?.sa.client_email ?? null,
        folder_id: driveFolderId(),
        folder_name: cfgRow?.folder_name ?? null,
        connected_at: cfgRow?.connected_at ?? null,
        source: cfgRow?.client_email ? "db" : "env",
      };
      try {
        const files = await driveList();
        return json(200, { ok: true, ...base, files });
      } catch (e) {
        return json(200, { ok: false, ...base, error: errMsg(e), files: [] });
      }
    }


    // ---- Sync an existing backup to Google Drive ----
    if (body.sync_to_drive && body.file) {
      if (isSystem) return json(403, { error: "user only" });
      if (!driveConfigured()) return json(400, { error: "drive_not_configured" });
      const res = await syncExistingToDrive(body.file);
      if (!res.ok) return json(500, { error: res.error ?? "drive sync failed" });
      return json(200, res);
    }

    // ---- Reject a pending request ----
    if (body.reject_request_id) {
      if (isSystem) return json(403, { error: "user only" });
      const { error } = await sb.from("backup_requests")
        .update({ status: "rejected", decided_by: actorId, decided_at: new Date().toISOString() })
        .eq("id", body.reject_request_id)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
      return json(200, { ok: true });
    }

    // ---- Approve a pending request → run snapshot ----
    if (body.approve_request_id) {
      const { data: reqRow, error: rErr } = await sb.from("backup_requests")
        .select("id, status").eq("id", body.approve_request_id).maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!reqRow) return json(404, { error: "request not found" });
      if (reqRow.status !== "pending") return json(400, { error: `request is ${reqRow.status}` });
      try {
        const res = await runSnapshot(body.approve_request_id);
        return json(200, res);
      } catch (e) {
        const msg = errMsg(e);
        console.error("backup-snapshot approve error", e);
        await sb.from("backup_requests").update({
          status: "failed",
          decided_by: actorId,
          decided_at: new Date().toISOString(),
          error: msg,
        }).eq("id", body.approve_request_id);
        return json(500, { error: msg });
      }
    }

    // ---- Restore (data + mirrored files) ----
    if ((body.restore && body.file) || body.restore_inline) {
      if (isSystem) return json(403, { error: "user only" });
      let snapshot: Record<string, unknown[]>;
      let stamp: string | null = null;

      if (body.restore_inline) {
        const p = body.payload;
        if (!p || typeof p !== "object" || Array.isArray(p)) {
          return json(400, { error: "invalid_backup_file" });
        }
        const keys = Object.keys(p as Record<string, unknown>);
        const known = new Set(TABLES);
        if (keys.length === 0 || keys.some((k) => !known.has(k))) {
          return json(400, { error: "invalid_backup_file" });
        }
        for (const k of keys) {
          if (!Array.isArray((p as Record<string, unknown>)[k])) {
            return json(400, { error: "invalid_backup_file" });
          }
        }
        snapshot = p as Record<string, unknown[]>;
      } else {
        const { data: dl, error: dlErr } = await sb.storage.from("backups").download(body.file!);
        if (dlErr || !dl) throw new Error(dlErr?.message ?? "download failed");
        snapshot = JSON.parse(await dl.text()) as Record<string, unknown[]>;
        const m = /^backup-(.+)\.json$/.exec(body.file!);
        if (m) stamp = m[1];
      }

      // Atomic DB restore via SECURITY DEFINER SQL function.
      const { data: counts, error: rpcErr } = await sb.rpc("restore_full_snapshot", { payload: snapshot });
      if (rpcErr) {
        console.error("restore_full_snapshot:", rpcErr);
        return json(500, { error: rpcErr.message });
      }

      // Copy mirrored bucket files back into their source buckets, if the
      // snapshot folder exists.
      let filesRestored = 0, filesSkipped = 0;
      if (stamp) {
        const mirrorRoot = `snapshot-${stamp}`;
        for (const bucket of FILE_BUCKETS) {
          let paths: string[] = [];
          try {
            paths = await listBucketRecursive("backups", `${mirrorRoot}/${bucket}`);
          } catch (_) { continue; }
          const stripPrefix = `${mirrorRoot}/${bucket}/`;
          for (const full of paths) {
            const dest = full.startsWith(stripPrefix) ? full.slice(stripPrefix.length) : null;
            if (!dest) { filesSkipped += 1; continue; }
            try {
              const { data: dl, error: dlErr } = await sb.storage.from("backups").download(full);
              if (dlErr || !dl) { filesSkipped += 1; continue; }
              const buf = new Uint8Array(await dl.arrayBuffer());
              const { error: upErr } = await sb.storage.from(bucket).upload(dest, buf, {
                contentType: dl.type || "application/octet-stream",
                upsert: true,
              });
              if (upErr) { filesSkipped += 1; continue; }
              filesRestored += 1;
            } catch (_) { filesSkipped += 1; }
          }
        }
      }

      return json(200, {
        ok: true,
        restored: body.file ?? "inline",
        counts,
        files: { restored: filesRestored, skipped: filesSkipped, mirrored: stamp !== null },
      });
    }


    // ---- Delete a backup file (and its matching file snapshot folder) ----
    if (body.delete && body.file) {
      if (isSystem) return json(403, { error: "user only" });
      // Protect the latest backup from deletion
      const { data: files, error: listErr } = await sb.storage.from("backups").list("", {
        limit: 1000,
        sortBy: { column: "name", order: "desc" },
      });
      if (listErr) throw new Error(listErr.message);
      const jsonFiles = (files ?? []).filter((f) => f.name.endsWith(".json"));
      const latest = jsonFiles[0]?.name;
      if (latest && latest === body.file) {
        return json(400, { error: "cannot_delete_latest" });
      }
      const { error: rmErr } = await sb.storage.from("backups").remove([body.file]);
      if (rmErr) throw new Error(rmErr.message);
      // Also remove the matching file-mirror folder if present.
      const stamp = body.file.replace(/^backup-/, "").replace(/\.json$/, "");
      await pruneOldFileSnapshots(
        jsonFiles.filter((f) => f.name !== body.file)
          .map((f) => f.name.replace(/^backup-/, "").replace(/\.json$/, "")),
      );
      void stamp;
      return json(200, { ok: true, deleted: body.file });
    }

    // ---- Manual immediate snapshot ----
    if (isSystem) return json(400, { error: "system must specify auto_approve_pending" });
    const res = await runSnapshot(null);
    return json(200, res);
  } catch (e) {
    console.error("backup-snapshot error", e);
    return json(500, { error: errMsg(e) });
  }
});
