// Master-admin API for invite links.
// Actions: create | list | revoke
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

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
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
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
  const isAdmin = !!me && (me.is_master_admin || me.role === "admin");
  if (!isAdmin) return json(403, { error: "admins only" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "create": {
        const role = String(body.role ?? "member") === "admin" ? "admin" : "member";
        const emailRaw = String(body.email ?? "").trim().toLowerCase();
        const email = emailRaw || null;
        const full_name = String(body.full_name ?? "").trim() || null;
        const presetPasswordRaw = typeof body.preset_password === "string" ? body.preset_password : "";
        const preset_password = presetPasswordRaw.trim() ? presetPasswordRaw : null;
        if (preset_password !== null && preset_password.length < 8) {
          return json(400, { error: "password_too_short" });
        }
        const password_hash = preset_password ? await bcrypt.hash(preset_password, 10) : null;

        // expires_in: "24h" | "7d" | "30d" | "never"
        const expiresIn = String(body.expires_in ?? "7d");
        const hoursMap: Record<string, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
        const expires_at = expiresIn === "never"
          ? null
          : new Date(Date.now() + (hoursMap[expiresIn] ?? 168) * 3600 * 1000).toISOString();

        const t = newToken();
        const { data: row, error } = await admin.from("invites").insert({
          token: t, role, email, full_name, expires_at, created_by: me!.id, password_hash,
        }).select("id, token, role, email, full_name, created_by, created_at, expires_at, revoked_at, used_at, used_by").single();
        if (error) throw error;
        const invite = { ...row, has_password: !!password_hash };
        return json(200, { invite, preset_password });
      }

      case "list": {
        const { data, error } = await admin
          .from("invites")
          .select("id, token, role, email, full_name, created_by, created_at, expires_at, revoked_at, used_at, used_by, password_hash")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const invites = (data ?? []).map((r: Record<string, unknown>) => {
          const { password_hash, ...rest } = r;
          return { ...rest, has_password: !!password_hash };
        });
        return json(200, { invites });
      }

      case "revoke": {
        const id = String(body.id ?? "");
        if (!id) return json(400, { error: "id required" });
        const { error } = await admin.from("invites")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id)
          .is("used_at", null);
        if (error) throw error;
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: `unknown action: ${action}` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-invites error", msg);
    return json(500, { error: msg });
  }
});
