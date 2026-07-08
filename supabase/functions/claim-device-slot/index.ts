// Claims a device slot for the authenticated user.
// Enforces profiles.max_devices — the oldest devices beyond the limit are
// marked revoked so they can be kicked via realtime.
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
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  if (!bearer) return json(401, { error: "missing token" });

  const admin = createClient(url, serviceKey);
  const { data: userRes, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userRes.user) return json(401, { error: "invalid token" });
  const userId = userRes.user.id;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const device_id = String(body.device_id ?? "").trim();
  const user_agent = String(body.user_agent ?? "").slice(0, 500) || null;
  if (!device_id || device_id.length < 8) return json(400, { error: "device_id required" });

  const { data: prof } = await admin
    .from("profiles")
    .select("max_devices")
    .eq("id", userId)
    .maybeSingle();
  const maxDevices = Math.max(0, Number(prof?.max_devices ?? 1));

  // Upsert this device's row (marks as active, refreshes last_seen_at).
  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("user_sessions")
    .upsert(
      { user_id: userId, device_id, user_agent, last_seen_at: now, revoked_at: null },
      { onConflict: "user_id,device_id" },
    );
  if (upErr) return json(500, { error: upErr.message });

  // If limited, revoke the oldest active rows beyond the limit.
  if (maxDevices > 0) {
    const { data: active } = await admin
      .from("user_sessions")
      .select("id, device_id, last_seen_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });
    const rows = active ?? [];
    const kick = rows.slice(maxDevices).map((r) => r.id);
    if (kick.length) {
      await admin
        .from("user_sessions")
        .update({ revoked_at: now })
        .in("id", kick);
    }
  }

  // Prune very old revoked rows (housekeeping).
  await admin
    .from("user_sessions")
    .delete()
    .lt("revoked_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());

  // Check current device is still active.
  const { data: mine } = await admin
    .from("user_sessions")
    .select("revoked_at")
    .eq("user_id", userId)
    .eq("device_id", device_id)
    .maybeSingle();

  return json(200, {
    ok: true,
    kicked: !!mine?.revoked_at,
    max_devices: maxDevices,
  });
});
