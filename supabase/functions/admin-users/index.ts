// Master-admin API for user management.
// Actions: list | set_role | approve | suspend | activate | delete
// Invites live in the separate `admin-invites` function (link-based flow).

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

// ─── Input safety (defense in depth; the client sanitizes too) ───
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVIS_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sText(value: unknown, maxLength = 500): string {
  if (value === null || value === undefined) return "";
  let s = String(value).replace(CTRL_RE, "").replace(INVIS_RE, "");
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
       .replace(/&#39;/g, "'").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&");
  s = s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return s.length > maxLength ? s.slice(0, maxLength).trim() : s;
}

function sUuid(value: unknown): string {
  const s = String(value ?? "").trim();
  return UUID_RE.test(s) ? s : "";
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing token" });

  const admin = createClient(url, serviceKey);
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes.user) return json(401, { error: "invalid token" });


  const { data: me } = await admin
    .from("profiles")
    .select("id, is_master_admin, role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  const isAdmin = me?.is_master_admin || me?.role === "admin";
  if (!isAdmin) return json(403, { error: "admin only" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = sText(body.action, 40);

  // Any admin (regular or master) can perform admin actions.
  // Target-level checks below still prevent mutating the master admin.


  try {
    switch (action) {
      case "list": {
        const [{ data: profiles }, listRes] = await Promise.all([
          admin.from("profiles").select("*").order("created_at", { ascending: false }),
          admin.auth.admin.listUsers({ perPage: 200 }),
        ]);
        const emailMap = new Map<string, string>();
        const lastMap = new Map<string, string | null>();
        for (const u of listRes.data?.users ?? []) {
          if (u.email) emailMap.set(u.id, u.email);
          lastMap.set(u.id, u.last_sign_in_at ?? null);
        }
        const users = (profiles ?? []).map((p) => ({
          ...p,
          full_name: p.full_name ?? (emailMap.get(p.id)?.split("@")[0]) ?? "User",
          email: emailMap.get(p.id) ?? p.email ?? null,
          last_sign_in_at: lastMap.get(p.id) ?? null,
          role: p.role ?? "member",
          status: p.status ?? "active",
        }));
        return json(200, { users });
      }





      case "set_role": {
        const user_id = sUuid(body.user_id);
        const role = sText(body.role, 20);
        if (!user_id || !["admin", "member"].includes(role)) {
          return json(400, { error: "user_id + role (admin|member) required" });
        }
        const { data: t } = await admin.from("profiles").select("is_master_admin").eq("id", user_id).maybeSingle();
        if (t?.is_master_admin) return json(400, { error: "cannot change master admin role" });
        const { error } = await admin.from("profiles").update({ role }).eq("id", user_id);
        if (error) throw error;
        return json(200, { ok: true });
      }

      case "set_password": {
        const user_id = sUuid(body.user_id);
        const password = String(body.password ?? "");
        if (!user_id) return json(400, { error: "user_id required" });
        if (password.length < 8 || password.length > 72) {
          return json(400, { error: "password must be 8-72 characters" });
        }
        const { data: t } = await admin
          .from("profiles").select("is_master_admin, role").eq("id", user_id).maybeSingle();
        if (!t) return json(404, { error: "user not found" });
        if (user_id === me.id) return json(400, { error: "use your own account settings to change your password" });
        if (!me.is_master_admin && (t.is_master_admin || t.role === "admin")) {
          return json(403, { error: "only the master admin can reset an admin's password" });
        }
        const { error } = await admin.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
        await admin.from("activity_log").insert({
          actor_id: me.id, action: "password_reset",
          entity_type: "auth", entity_id: user_id, meta: { by: "admin" },
        });
        return json(200, { ok: true });
      }

      case "approve": {
        const user_id = sUuid(body.user_id);
        const role = String(body.role ?? "member") === "admin" ? "admin" : "member";
        if (!user_id) return json(400, { error: "user_id required" });
        const { error } = await admin.from("profiles").update({
          status: "active", active: true, role,
        }).eq("id", user_id);
        if (error) throw error;
        return json(200, { ok: true });
      }

      case "suspend":
      case "activate": {
        const user_id = sUuid(body.user_id);
        if (!user_id) return json(400, { error: "user_id required" });
        const { data: t } = await admin.from("profiles").select("is_master_admin").eq("id", user_id).maybeSingle();
        if (t?.is_master_admin) return json(400, { error: "cannot suspend master admin" });
        if (action === "suspend") {
          const reason = sText(body.reason, 500);
          await admin.from("profiles").update({
            status: "suspended", active: false,
            suspended_by: me.id,
            suspended_at: new Date().toISOString(),
            suspend_reason: reason || null,
          }).eq("id", user_id);
        } else {
          await admin.from("profiles").update({
            status: "active", active: true,
            suspended_by: null, suspended_at: null, suspend_reason: null,
          }).eq("id", user_id);
        }
        // Do NOT ban at the auth layer — we want the suspended user to sign in
        // and see the branded "you are suspended" screen with the admin's name.
        await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        return json(200, { ok: true });
      }

      case "delete": {
        const user_id = sUuid(body.user_id);
        if (!user_id) return json(400, { error: "user_id required" });
        if (user_id === me.id) return json(400, { error: "cannot delete yourself" });
        const { data: t } = await admin.from("profiles").select("is_master_admin").eq("id", user_id).maybeSingle();
        if (t?.is_master_admin) return json(400, { error: "cannot delete master admin" });
        await admin.from("profiles").delete().eq("id", user_id);
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        return json(200, { ok: true });
      }


      default:
        return json(400, { error: `unknown action: ${action}` });
    }
  } catch (e) {
    console.error("admin-users error", e);
    return json(500, { error: errMsg(e) });
  }
});
