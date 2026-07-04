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
  const action = String(body.action ?? "");

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
        const user_id = String(body.user_id ?? "");
        const role = String(body.role ?? "");
        if (!user_id || !["admin", "member"].includes(role)) {
          return json(400, { error: "user_id + role (admin|member) required" });
        }
        const { data: t } = await admin.from("profiles").select("is_master_admin").eq("id", user_id).maybeSingle();
        if (t?.is_master_admin) return json(400, { error: "cannot change master admin role" });
        const { error } = await admin.from("profiles").update({ role }).eq("id", user_id);
        if (error) throw error;
        return json(200, { ok: true });
      }

      case "approve": {
        const user_id = String(body.user_id ?? "");
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
        const user_id = String(body.user_id ?? "");
        if (!user_id) return json(400, { error: "user_id required" });
        const { data: t } = await admin.from("profiles").select("is_master_admin").eq("id", user_id).maybeSingle();
        if (t?.is_master_admin) return json(400, { error: "cannot suspend master admin" });
        if (action === "suspend") {
          const reason = typeof body.reason === "string" ? body.reason.trim() : "";
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
        const user_id = String(body.user_id ?? "");
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-users error", msg);
    return json(500, { error: msg });
  }
});
