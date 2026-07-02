// Share links: master-admin CRUD + public read-only resolution/data.
// Actions:
//   Master-admin (Bearer required): list | create | update | revoke | delete
//   Public (no auth):               resolve | data
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

function b64url(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALLOWED = new Set([
  "dashboard", "projects", "tasks", "team", "league", "references", "activity",
]);
const PUBLIC_ACTIONS = new Set(["resolve", "data"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body.action ?? "");

  // Public branches
  if (action === "resolve") {
    const token = String(body.token ?? "");
    const password = body.password != null ? String(body.password) : null;
    if (!token) return json(400, { error: "missing token" });

    const { data: link } = await admin.from("share_links").select("*").eq("token", token).maybeSingle();
    if (!link) return json(404, { error: "not_found" });
    if (link.revoked) return json(403, { error: "revoked" });
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return json(403, { error: "expired" });
    }
    if (link.max_uses != null && link.use_count >= link.max_uses) {
      return json(403, { error: "exhausted" });
    }
    if (link.password_hash) {
      if (!password) return json(401, { error: "password_required" });
      const h = await sha256hex(password);
      if (h !== link.password_hash) return json(401, { error: "wrong_password" });
    }
    await admin.from("share_links")
      .update({ use_count: link.use_count + 1, last_used_at: new Date().toISOString() })
      .eq("id", link.id);
    return json(200, {
      link: {
        label: link.label,
        allowed_pages: link.allowed_pages,
        expires_at: link.expires_at,
      },
    });
  }

  if (action === "data") {
    const token = String(body.token ?? "");
    const resource = String(body.resource ?? "");
    if (!token || !resource) return json(400, { error: "missing params" });
    if (!ALLOWED.has(resource)) return json(400, { error: "bad resource" });

    const { data: link } = await admin.from("share_links").select("*").eq("token", token).maybeSingle();
    if (!link || link.revoked) return json(403, { error: "forbidden" });
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return json(403, { error: "expired" });
    }
    if (!Array.isArray(link.allowed_pages) || !link.allowed_pages.includes(resource)) {
      return json(403, { error: "not_allowed" });
    }

    try {
      switch (resource) {
        case "dashboard": {
          const [{ count: activeTasks }, { count: doneTasks }, { count: overdue }, { count: activeProjects }] = await Promise.all([
            admin.from("tasks").select("*", { count: "exact", head: true }).in("status", ["todo", "in_progress", "paused", "in_review"]),
            admin.from("tasks").select("*", { count: "exact", head: true }).eq("status", "done"),
            admin.from("tasks").select("*", { count: "exact", head: true }).lt("due_date", new Date().toISOString()).neq("status", "done"),
            admin.from("projects").select("*", { count: "exact", head: true }).eq("status", "active"),
          ]);
          const { data: dist } = await admin.from("tasks").select("status");
          const distribution: Record<string, number> = {};
          (dist ?? []).forEach((r: { status: string }) => { distribution[r.status] = (distribution[r.status] ?? 0) + 1; });
          return json(200, {
            kpis: { activeTasks: activeTasks ?? 0, doneTasks: doneTasks ?? 0, overdue: overdue ?? 0, activeProjects: activeProjects ?? 0 },
            distribution,
          });
        }
        case "projects": {
          const { data } = await admin.from("projects")
            .select("id, name_ar, name_en, description, status, color, created_at")
            .order("created_at", { ascending: false });
          return json(200, { projects: data ?? [] });
        }
        case "tasks": {
          const { data } = await admin.from("tasks")
            .select("id, title, description, status, priority, due_date, start_date, project_id, assignee_id, created_at")
            .order("created_at", { ascending: false })
            .limit(200);
          return json(200, { tasks: data ?? [] });
        }
        case "team": {
          const { data } = await admin.from("profiles")
            .select("id, full_name, role, avatar_url, is_master_admin")
            .eq("status", "active");
          return json(200, { members: data ?? [] });
        }
        case "league": {
          const { data: members } = await admin.from("profiles").select("id, full_name, avatar_url").eq("status", "active");
          const { data: doneRows } = await admin.from("tasks").select("assignee_id").eq("status", "done");
          const counts: Record<string, number> = {};
          (doneRows ?? []).forEach((r: { assignee_id: string | null }) => {
            if (r.assignee_id) counts[r.assignee_id] = (counts[r.assignee_id] ?? 0) + 1;
          });
          const board = (members ?? [])
            .map((m: { id: string; full_name: string; avatar_url: string | null }) => ({ ...m, done: counts[m.id] ?? 0 }))
            .sort((a, b) => b.done - a.done);
          return json(200, { board });
        }
        case "references": {
          const { data } = await admin.from("references")
            .select("id, title, url, description, category, created_at")
            .order("created_at", { ascending: false });
          return json(200, { references: data ?? [] });
        }
        case "activity": {
          const { data } = await admin.from("activity_log")
            .select("id, action, entity_type, entity_id, meta, created_at, actor_id")
            .order("created_at", { ascending: false })
            .limit(100);
          const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
          const actors: Record<string, string> = {};
          if (actorIds.length) {
            const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", actorIds);
            (profs ?? []).forEach((p: { id: string; full_name: string }) => { actors[p.id] = p.full_name; });
          }
          return json(200, { activity: data ?? [], actors });
        }
      }
    } catch (e) {
      return json(500, { error: String((e as Error).message ?? e) });
    }
    return json(400, { error: "unknown resource" });
  }

  // Admin branches
  if (!PUBLIC_ACTIONS.has(action)) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    if (!bearer) return json(401, { error: "missing token" });
    const { data: userRes, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userRes.user) return json(401, { error: "invalid token" });
    const { data: me } = await admin.from("profiles")
      .select("id, is_master_admin")
      .eq("id", userRes.user.id).maybeSingle();
    if (!me?.is_master_admin) return json(403, { error: "master admin only" });

    try {
      switch (action) {
        case "list": {
          const { data, error } = await admin.from("share_links")
            .select("*").order("created_at", { ascending: false });
          if (error) throw error;
          return json(200, { links: data ?? [] });
        }
        case "create": {
          const label = String(body.label ?? "").trim();
          const allowed_pages = Array.isArray(body.allowed_pages)
            ? (body.allowed_pages as string[]).filter((p) => ALLOWED.has(p))
            : [];
          if (!allowed_pages.length) return json(400, { error: "select at least one page" });
          const expires_at = body.expires_at ? String(body.expires_at) : null;
          const max_uses = body.max_uses != null && body.max_uses !== "" ? Number(body.max_uses) : null;
          const pw = body.password ? String(body.password) : null;
          const password_hash = pw ? await sha256hex(pw) : null;
          const t = newToken();
          const { data, error } = await admin.from("share_links").insert({
            token: t, label, allowed_pages, expires_at, max_uses, password_hash,
            created_by: me.id,
          }).select("*").single();
          if (error) throw error;
          return json(200, { link: data });
        }
        case "update": {
          const id = String(body.id ?? "");
          if (!id) return json(400, { error: "missing id" });
          const patch: Record<string, unknown> = {};
          if (typeof body.label === "string") patch.label = body.label.trim();
          if (Array.isArray(body.allowed_pages)) {
            patch.allowed_pages = (body.allowed_pages as string[]).filter((p) => ALLOWED.has(p));
          }
          if ("expires_at" in body) patch.expires_at = body.expires_at ? String(body.expires_at) : null;
          if ("max_uses" in body) patch.max_uses = body.max_uses != null && body.max_uses !== "" ? Number(body.max_uses) : null;
          if ("revoked" in body) patch.revoked = !!body.revoked;
          if ("password" in body) {
            const pw = body.password ? String(body.password) : null;
            patch.password_hash = pw ? await sha256hex(pw) : null;
          }
          if ("reset_uses" in body && body.reset_uses) patch.use_count = 0;
          const { data, error } = await admin.from("share_links")
            .update(patch).eq("id", id).select("*").single();
          if (error) throw error;
          return json(200, { link: data });
        }
        case "revoke": {
          const id = String(body.id ?? "");
          const { data, error } = await admin.from("share_links")
            .update({ revoked: true }).eq("id", id).select("*").single();
          if (error) throw error;
          return json(200, { link: data });
        }
        case "delete": {
          const id = String(body.id ?? "");
          const { error } = await admin.from("share_links").delete().eq("id", id);
          if (error) throw error;
          return json(200, { ok: true });
        }
      }
    } catch (e) {
      return json(500, { error: String((e as Error).message ?? e) });
    }
  }

  return json(400, { error: "unknown action" });
});
