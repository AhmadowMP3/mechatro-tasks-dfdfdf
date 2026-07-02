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
      // Common lookups reused across resources
      async function loadProfiles() {
        const { data } = await admin.from("profiles")
          .select("id, full_name, avatar_url, role, is_master_admin, status, active")
          .eq("active", true);
        return data ?? [];
      }
      async function loadProjects() {
        const { data } = await admin.from("projects")
          .select("id, name_ar, name_en, description, status, color, created_at, archived");
        return data ?? [];
      }

      switch (resource) {
        case "dashboard": {
          const [{ data: tasks }, projects, profiles, { data: activity }, { data: sessions }] = await Promise.all([
            admin.from("tasks").select("id, title, status, priority, due_date, start_date, project_id, assignee_id, created_at, completed_at"),
            loadProjects(),
            loadProfiles(),
            admin.from("activity_log")
              .select("id, action, entity_type, entity_id, meta, created_at, actor_id")
              .neq("action", "signed_in").neq("action", "signed_out")
              .order("created_at", { ascending: false }).limit(20),
            admin.from("work_sessions").select("id, user_id, task_id, started_at, ended_at, duration_minutes")
              .order("started_at", { ascending: false }).limit(500),
          ]);
          const now = Date.now();
          const isOverdue = (t: { due_date: string | null; status: string }) =>
            !!t.due_date && new Date(t.due_date).getTime() < now && t.status !== "done";
          const active = (tasks ?? []).filter((t) => t.status !== "done");
          const kpis = {
            activeTasks: active.length,
            doneTasks: (tasks ?? []).filter((t) => t.status === "done").length,
            overdue: (tasks ?? []).filter(isOverdue).length,
            activeProjects: projects.filter((p) => p.status === "active" && !p.archived).length,
          };
          const distribution: Record<string, number> = {};
          (tasks ?? []).forEach((t) => { distribution[t.status] = (distribution[t.status] ?? 0) + 1; });

          // 14-day completion trend
          const trend: { d: string; count: number }[] = [];
          const today = new Date(); today.setHours(0, 0, 0, 0);
          for (let i = 13; i >= 0; i--) {
            const d = new Date(today); d.setDate(today.getDate() - i);
            trend.push({ d: d.toISOString().slice(0, 10), count: 0 });
          }
          (tasks ?? []).filter((t) => t.status === "done" && t.completed_at).forEach((t) => {
            const iso = new Date(t.completed_at!).toISOString().slice(0, 10);
            const b = trend.find((x) => x.d === iso);
            if (b) b.count++;
          });

          // Per-project progress (top 6 by task count)
          const projectStats = projects.filter((p) => p.status === "active" && !p.archived).map((p) => {
            const list = (tasks ?? []).filter((t) => t.project_id === p.id);
            const done = list.filter((t) => t.status === "done").length;
            return { id: p.id, name_ar: p.name_ar, name_en: p.name_en, color: p.color, total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
          }).sort((a, b) => b.total - a.total).slice(0, 6);

          // Team pulse — top 6 by active load
          const teamPulse = profiles.map((pr) => {
            const list = active.filter((t) => t.assignee_id === pr.id);
            const doneCount = (tasks ?? []).filter((t) => t.status === "done" && t.assignee_id === pr.id).length;
            return {
              id: pr.id, full_name: pr.full_name, avatar_url: pr.avatar_url, role: pr.role,
              active: list.length,
              overdue: list.filter(isOverdue).length,
              done: doneCount,
            };
          }).sort((a, b) => b.active - a.active).slice(0, 6);

          // Live sessions (no ended_at)
          const liveNow = (sessions ?? []).filter((s) => !s.ended_at).length;
          const totalHours = Math.round(((sessions ?? []).reduce((sum, s) => {
            const mins = s.duration_minutes ?? (s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000 : 0);
            return sum + mins;
          }, 0) / 60) * 10) / 10;

          // Actor map for recent activity
          const actorIds = Array.from(new Set((activity ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
          const actors: Record<string, { name: string; avatar_url: string | null }> = {};
          if (actorIds.length) {
            const { data: profs } = await admin.from("profiles").select("id, full_name, avatar_url").in("id", actorIds);
            (profs ?? []).forEach((p: { id: string; full_name: string; avatar_url: string | null }) => {
              actors[p.id] = { name: p.full_name, avatar_url: p.avatar_url };
            });
          }

          return json(200, {
            kpis, distribution, trend, projectStats, teamPulse,
            liveNow, totalHours,
            recent: activity ?? [], actors,
          });
        }
        case "projects": {
          const projects = await loadProjects();
          const { data: tasks } = await admin.from("tasks").select("id, status, project_id, assignee_id");
          const list = projects.map((p) => {
            const t = (tasks ?? []).filter((x) => x.project_id === p.id);
            const done = t.filter((x) => x.status === "done").length;
            const memberIds = Array.from(new Set(t.map((x) => x.assignee_id).filter(Boolean))) as string[];
            return {
              ...p,
              total: t.length, done, pct: t.length ? Math.round((done / t.length) * 100) : 0,
              memberIds,
            };
          }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const profiles = await loadProfiles();
          const members: Record<string, { full_name: string; avatar_url: string | null }> = {};
          profiles.forEach((p) => { members[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
          return json(200, { projects: list, members });
        }
        case "tasks": {
          const [{ data: tasks }, projects, profiles] = await Promise.all([
            admin.from("tasks").select("id, title, description, status, priority, due_date, start_date, project_id, assignee_id, created_at, tags")
              .order("created_at", { ascending: false }).limit(300),
            loadProjects(),
            loadProfiles(),
          ]);
          const projMap: Record<string, { name_ar: string | null; name_en: string | null; color: string | null }> = {};
          projects.forEach((p) => { projMap[p.id] = { name_ar: p.name_ar, name_en: p.name_en, color: p.color }; });
          const memMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
          profiles.forEach((p) => { memMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
          return json(200, { tasks: tasks ?? [], projects: projMap, members: memMap });
        }
        case "team": {
          const profiles = await loadProfiles();
          const { data: tasks } = await admin.from("tasks").select("id, status, assignee_id");
          const members = profiles.map((m) => {
            const list = (tasks ?? []).filter((t) => t.assignee_id === m.id);
            const done = list.filter((t) => t.status === "done").length;
            const active = list.filter((t) => t.status !== "done").length;
            return {
              id: m.id, full_name: m.full_name, avatar_url: m.avatar_url,
              role: m.role, is_master_admin: m.is_master_admin,
              total: list.length, done, active,
              completion: list.length ? Math.round((done / list.length) * 100) : 0,
            };
          }).sort((a, b) => b.done - a.done);
          return json(200, { members });
        }
        case "league": {
          const profiles = await loadProfiles();
          const { data: tasks } = await admin.from("tasks").select("id, status, priority, assignee_id, completed_at");
          const POINTS: Record<string, number> = { urgent: 5, high: 3, normal: 2, low: 1 };
          const board = profiles.map((m) => {
            const done = (tasks ?? []).filter((t) => t.status === "done" && t.assignee_id === m.id);
            const points = done.reduce((s, t) => s + (POINTS[t.priority as string] ?? 1), 0);
            return {
              id: m.id, full_name: m.full_name, avatar_url: m.avatar_url, role: m.role,
              is_master_admin: m.is_master_admin,
              done: done.length, points,
            };
          }).sort((a, b) => b.points - a.points || b.done - a.done);
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
            .limit(200);
          const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
          const actors: Record<string, { name: string; avatar_url: string | null }> = {};
          if (actorIds.length) {
            const { data: profs } = await admin.from("profiles").select("id, full_name, avatar_url").in("id", actorIds);
            (profs ?? []).forEach((p: { id: string; full_name: string; avatar_url: string | null }) => {
              actors[p.id] = { name: p.full_name, avatar_url: p.avatar_url };
            });
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
