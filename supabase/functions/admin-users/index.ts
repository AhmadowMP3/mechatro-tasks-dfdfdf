// Master-admin API for user management.
// Verifies caller is the master admin via SSR-forwarded JWT.
// Actions: list | invite | assign_role | suspend | activate | delete | resend_invite
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Identify caller
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing token" });

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes.user) return json(401, { error: "invalid token" });

  const admin = createClient(url, serviceKey);

  const { data: me } = await admin
    .from("profiles")
    .select("id, is_master_admin")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (!me?.is_master_admin) return json(403, { error: "master admin only" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body.action ?? "");

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
        const { data: userRoles } = await admin
          .from("user_roles")
          .select("user_id, role_id, roles(name, slug)");
        const rolesByUser = new Map<string, Array<{ id: string; name: string; slug: string }>>();
        for (const r of userRoles ?? []) {
          const list = rolesByUser.get(r.user_id) ?? [];
          const meta = (r as { roles: { name: string; slug: string } | null }).roles;
          if (meta) list.push({ id: r.role_id, name: meta.name, slug: meta.slug });
          rolesByUser.set(r.user_id, list);
        }
        const users = (profiles ?? []).map((p) => ({
          ...p,
          email: emailMap.get(p.id) ?? null,
          last_sign_in_at: lastMap.get(p.id) ?? null,
          roles: rolesByUser.get(p.id) ?? [],
        }));
        return json(200, { users });
      }

      case "invite": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const full_name = String(body.full_name ?? "").trim() || email.split("@")[0];
        const role_id = body.role_id ? String(body.role_id) : null;
        if (!email) return json(400, { error: "email required" });

        const redirect = String(body.redirect_to ?? "") || undefined;
        const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name, invited_by: me.id, invited_role_id: role_id },
          redirectTo: redirect,
        });
        if (invErr) throw invErr;
        const newId = inv.user?.id;
        if (newId) {
          await admin.from("profiles").update({
            full_name,
            status: "pending",
            invited_by: me.id,
            invited_at: new Date().toISOString(),
          }).eq("id", newId);
          if (role_id) {
            await admin.from("user_roles").upsert({
              user_id: newId, role_id, assigned_by: me.id,
            }, { onConflict: "user_id,role_id" });
          }
        }
        return json(200, { ok: true, user_id: newId });
      }

      case "resend_invite": {
        const user_id = String(body.user_id ?? "");
        if (!user_id) return json(400, { error: "user_id required" });
        const { data: u } = await admin.auth.admin.getUserById(user_id);
        if (!u.user?.email) return json(400, { error: "user has no email" });
        const { error } = await admin.auth.admin.inviteUserByEmail(u.user.email);
        if (error) throw error;
        return json(200, { ok: true });
      }

      case "assign_role": {
        const user_id = String(body.user_id ?? "");
        const role_id = String(body.role_id ?? "");
        if (!user_id || !role_id) return json(400, { error: "user_id + role_id required" });
        // Single role model: replace existing
        await admin.from("user_roles").delete().eq("user_id", user_id);
        const { error } = await admin.from("user_roles").insert({
          user_id, role_id, assigned_by: me.id,
        });
        if (error) throw error;
        return json(200, { ok: true });
      }

      case "suspend":
      case "activate": {
        const user_id = String(body.user_id ?? "");
        if (!user_id) return json(400, { error: "user_id required" });
        const status = action === "suspend" ? "suspended" : "active";
        await admin.from("profiles").update({ status, active: status === "active" }).eq("id", user_id);
        // Also ban / unban in auth
        await admin.auth.admin.updateUserById(user_id, {
          ban_duration: action === "suspend" ? "876000h" : "none",
        });
        return json(200, { ok: true });
      }

      case "delete": {
        const user_id = String(body.user_id ?? "");
        if (!user_id) return json(400, { error: "user_id required" });
        if (user_id === me.id) return json(400, { error: "cannot delete yourself" });
        // Check target isn't master admin
        const { data: t } = await admin.from("profiles").select("is_master_admin").eq("id", user_id).maybeSingle();
        if (t?.is_master_admin) return json(400, { error: "cannot delete master admin" });
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
