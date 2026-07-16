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
//   { auto_approve_pending: true }       — service-role only: snapshot any pending >24h
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
  } = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

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

  async function mirrorBucketFiles(stamp: string): Promise<{ mirrored: number; skipped: number; errors: number }> {
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

  async function runSnapshot(requestId: string | null, systemDecision = false) {
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

    // Mirror storage buckets for cold recovery (files not restored, but preserved).
    const fileStats = await mirrorBucketFiles(stamp);

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

    // ---- Restore (data only) ----
    if (body.restore && body.file) {
      if (isSystem) return json(403, { error: "user only" });
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
