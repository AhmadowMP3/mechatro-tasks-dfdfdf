// Master-admin API for role & permission management.
// Actions: list | create | update | delete | set_permissions
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

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "role";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing token" });

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes } = await asUser.auth.getUser();
  if (!userRes.user) return json(401, { error: "invalid token" });

  const admin = createClient(url, serviceKey);
  const { data: me } = await admin.from("profiles").select("is_master_admin").eq("id", userRes.user.id).maybeSingle();
  if (!me?.is_master_admin) return json(403, { error: "master admin only" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "list": {
        const [{ data: roles }, { data: rp }, { data: counts }] = await Promise.all([
          admin.from("roles").select("*").order("is_system", { ascending: false }).order("name"),
          admin.from("role_permissions").select("role_id, permission"),
          admin.from("user_roles").select("role_id"),
        ]);
        const permsBy = new Map<string, string[]>();
        for (const r of rp ?? []) {
          const arr = permsBy.get(r.role_id) ?? [];
          arr.push(r.permission);
          permsBy.set(r.role_id, arr);
        }
        const countBy = new Map<string, number>();
        for (const r of counts ?? []) {
          countBy.set(r.role_id, (countBy.get(r.role_id) ?? 0) + 1);
        }
        const enriched = (roles ?? []).map((r) => ({
          ...r,
          permissions: permsBy.get(r.id) ?? [],
          user_count: countBy.get(r.id) ?? 0,
        }));
        return json(200, { roles: enriched });
      }

      case "create": {
        const name = String(body.name ?? "").trim();
        const description = body.description ? String(body.description) : null;
        const color = body.color ? String(body.color) : "#1D9BF0";
        const permissions = (body.permissions as string[] | undefined) ?? [];
        if (!name) return json(400, { error: "name required" });
        const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);
        const { data: role, error } = await admin.from("roles").insert({
          name, slug, description, color, is_system: false,
        }).select("id").single();
        if (error) throw error;
        if (permissions.length) {
          await admin.from("role_permissions").insert(
            permissions.map((p) => ({ role_id: role.id, permission: p })),
          );
        }
        return json(200, { ok: true, role_id: role.id });
      }

      case "update": {
        const role_id = String(body.role_id ?? "");
        if (!role_id) return json(400, { error: "role_id required" });
        const patch: Record<string, unknown> = {};
        if (typeof body.name === "string") patch.name = body.name.trim();
        if ("description" in body) patch.description = body.description ?? null;
        if (typeof body.color === "string") patch.color = body.color;
        const { data: existing } = await admin.from("roles").select("is_system").eq("id", role_id).maybeSingle();
        if (!existing) return json(404, { error: "role not found" });
        const { error } = await admin.from("roles").update(patch).eq("id", role_id);
        if (error) throw error;
        return json(200, { ok: true });
      }

      case "set_permissions": {
        const role_id = String(body.role_id ?? "");
        const permissions = (body.permissions as string[] | undefined) ?? [];
        if (!role_id) return json(400, { error: "role_id required" });
        await admin.from("role_permissions").delete().eq("role_id", role_id);
        if (permissions.length) {
          const { error } = await admin.from("role_permissions").insert(
            permissions.map((p) => ({ role_id, permission: p })),
          );
          if (error) throw error;
        }
        return json(200, { ok: true });
      }

      case "delete": {
        const role_id = String(body.role_id ?? "");
        if (!role_id) return json(400, { error: "role_id required" });
        const { data: r } = await admin.from("roles").select("is_system").eq("id", role_id).maybeSingle();
        if (!r) return json(404, { error: "role not found" });
        if (r.is_system) return json(400, { error: "cannot delete system role" });
        const { count } = await admin.from("user_roles").select("*", { count: "exact", head: true }).eq("role_id", role_id);
        if ((count ?? 0) > 0) return json(400, { error: "role has assigned users" });
        const { error } = await admin.from("roles").delete().eq("id", role_id);
        if (error) throw error;
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: `unknown action: ${action}` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-roles error", msg);
    return json(500, { error: msg });
  }
});
