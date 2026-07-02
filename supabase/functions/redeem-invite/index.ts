// Public: redeems an invite token and creates the auth user.
// No JWT required — the token itself is the credential.
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

type Invite = {
  id: string;
  token: string;
  role: "admin" | "member";
  email: string | null;
  full_name: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  used_at: string | null;
  created_by: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const mode = String(body.mode ?? "redeem");
  const token = String(body.token ?? "").trim();
  if (!token) return json(400, { error: "token required" });

  const { data: raw } = await admin
    .from("invites")
    .select("id, token, role, email, full_name, expires_at, revoked_at, used_at, created_by")
    .eq("token", token)
    .maybeSingle();
  const inv = raw as Invite | null;

  if (!inv) return json(404, { error: "invalid_invite" });
  if (inv.revoked_at) return json(410, { error: "invite_revoked" });
  if (inv.used_at) return json(410, { error: "invite_used" });
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    return json(410, { error: "invite_expired" });
  }

  // Peek — return safe metadata for the accept page to render.
  if (mode === "peek") {
    return json(200, {
      invite: {
        role: inv.role,
        email: inv.email,
        full_name: inv.full_name,
        expires_at: inv.expires_at,
        is_email_locked: !!inv.email,
      },
    });
  }

  // Redeem: create the user, wire up the profile, and mark used.
  const emailInput = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const full_name = String(body.full_name ?? "").trim() || inv.full_name || null;

  if (!password || password.length < 8) return json(400, { error: "password_too_short" });

  const email = inv.email ? inv.email : emailInput;
  if (!email) return json(400, { error: "email_required" });
  if (inv.email && emailInput && emailInput !== inv.email) {
    return json(400, { error: "email_mismatch" });
  }

  // Create the auth user (email pre-confirmed).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, invited_via: inv.id },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? "create_failed";
    // A duplicate address is the most common failure — normalize it.
    if (/already/i.test(msg)) return json(409, { error: "email_taken" });
    return json(500, { error: msg });
  }

  const uid = created.user.id;

  // handle_new_user() already inserted a profile row; upgrade role/status here.
  const { error: profErr } = await admin.from("profiles").update({
    full_name: full_name ?? email.split("@")[0],
    role: inv.role,
    status: "active",
    active: true,
    invited_by: inv.created_by,
    invited_at: new Date().toISOString(),
  }).eq("id", uid);
  if (profErr) console.warn("profile update failed", profErr.message);

  // Mark the invite consumed.
  const { error: markErr } = await admin.from("invites").update({
    used_at: new Date().toISOString(),
    used_by: uid,
  }).eq("id", inv.id);
  if (markErr) console.warn("invite mark failed", markErr.message);

  return json(200, { ok: true, email });
});
