// Backup & restore edge function.
// A pending row in public.backup_requests is created every 10 days by cron.
// A master admin approves it here, which triggers the actual snapshot.
//
// Body variants:
//   { manual: true }                     — master admin immediate snapshot
//   { approve_request_id: "<uuid>" }     — master admin approves a pending request → snapshot
//   { reject_request_id: "<uuid>" }      — master admin rejects a pending request
//   { restore: true, file: "backup-...json" } — master admin restore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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


// FK-safe insert order (parents first). Delete goes in reverse.
const TABLES = [
  "app_config",
  "profiles",
  "projects",
  "references",
  "league_seasons",
  "invites",
  "share_links",
  "tasks",
  "task_files",
  "task_comments",
  "work_sessions",
  "season_scores",
  "user_badges",
  "member_reports",
  "activity_log",
  "notifications",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, serviceKey);

  let body: {
    manual?: boolean;
    restore?: boolean;
    file?: string;
    approve_request_id?: string;
    reject_request_id?: string;
  } = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  // ---- AuthN/Z: master admin only for every action ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing token" });
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes.user) return json(401, { error: "invalid token" });
  const { data: me } = await sb.from("profiles")
    .select("id, is_master_admin").eq("id", userRes.user.id).maybeSingle();
  if (!me?.is_master_admin) return json(403, { error: "master admin only" });

  async function runSnapshot(requestId: string | null) {
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

    if (requestId) {
      await sb.from("backup_requests").update({
        status: "completed",
        decided_by: me.id,
        decided_at: new Date().toISOString(),
        result_file: filename,
      }).eq("id", requestId);
    }

    return {
      ok: true,
      file: filename,
      tables: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])),
    };
  }

  try {
    // ---- Reject a pending request ----
    if (body.reject_request_id) {
      const { error } = await sb.from("backup_requests")
        .update({ status: "rejected", decided_by: me.id, decided_at: new Date().toISOString() })
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
          decided_by: me.id,
          decided_at: new Date().toISOString(),
          error: msg,
        }).eq("id", body.approve_request_id);
        return json(500, { error: msg });
      }
    }

    // ---- Restore ----
    if (body.restore && body.file) {
      const { data: dl, error: dlErr } = await sb.storage.from("backups").download(body.file);
      if (dlErr || !dl) throw new Error(dlErr?.message ?? "download failed");
      const snapshot = JSON.parse(await dl.text()) as Record<string, unknown[]>;
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
      return json(200, { ok: true, restored: body.file });
    }

    // ---- Manual immediate snapshot ----
    const res = await runSnapshot(null);
    return json(200, res);
  } catch (e) {
    console.error("backup-snapshot error", e);
    return json(500, { error: errMsg(e) });
  }
});
