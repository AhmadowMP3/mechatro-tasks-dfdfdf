// Backup & restore edge function. Scheduled by pg_cron every 10 days.
// POST body: { manual?: true } snapshot; { restore: true, file: "backup-...json" } restore.
//
// AuthN/Z:
//  - User-initiated calls must present a master-admin Bearer JWT.
//  - Scheduled cron jobs may present the `x-backup-cron-secret` header matching
//    the BACKUP_CRON_SECRET env var (snapshot only, never restore).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backup-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "content-type": "application/json" },
  });
}

const TABLES = [
  "profiles", "projects", "tasks", "task_files",
  "task_comments", "work_sessions", "activity_log", "notifications",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("BACKUP_CRON_SECRET") ?? "";
  const sb = createClient(url, serviceKey);

  let body: { manual?: boolean; restore?: boolean; file?: string } = {};
  try { body = await req.json(); } catch (_) { /* scheduled */ }

  // ---- AuthN/Z gate ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const cronHeader = req.headers.get("x-backup-cron-secret") ?? "";

  const isCron = !body.restore && cronSecret.length > 0 && cronHeader === cronSecret;
  if (!isCron) {
    if (!token) return json(401, { error: "missing token" });
    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userRes.user) return json(401, { error: "invalid token" });
    const { data: me } = await sb.from("profiles")
      .select("id, is_master_admin").eq("id", userRes.user.id).maybeSingle();
    if (!me?.is_master_admin) return json(403, { error: "master admin only" });
  }


  try {
    if (body.restore && body.file) {
      const { data: dl, error: dlErr } = await sb.storage.from("backups").download(body.file);
      if (dlErr || !dl) throw new Error(dlErr?.message ?? "download failed");
      const snapshot = JSON.parse(await dl.text()) as Record<string, unknown[]>;
      // truncate + reinsert in FK-safe order (reverse for delete, forward for insert)
      for (const t of [...TABLES].reverse()) {
        await sb.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      }
      for (const t of TABLES) {
        const rows = snapshot[t] ?? [];
        if (rows.length) {
          const { error } = await sb.from(t).insert(rows as never);
          if (error) console.error(`restore ${t}:`, error.message);
        }
      }
      return new Response(JSON.stringify({ ok: true, restored: body.file }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Snapshot
    const snapshot: Record<string, unknown[]> = {};
    for (const t of TABLES) {
      const { data, error } = await sb.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      snapshot[t] = data ?? [];
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${stamp}.json`;
    const payload = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    const { error: upErr } = await sb.storage.from("backups").upload(filename, payload, {
      contentType: "application/json", upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    // Retain last 12
    const { data: list } = await sb.storage.from("backups").list("", {
      limit: 200, sortBy: { column: "created_at", order: "desc" },
    });
    const stale = (list ?? []).filter((f) => f.name.endsWith(".json")).slice(12).map((f) => f.name);
    if (stale.length) await sb.storage.from("backups").remove(stale);

    return new Response(JSON.stringify({ ok: true, file: filename, tables: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])) }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
