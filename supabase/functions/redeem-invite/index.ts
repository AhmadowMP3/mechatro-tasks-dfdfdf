// Public: redeems an invite token and creates the auth user.
// No JWT required — the token itself is the credential.
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
  password_hash: string | null;
  password_attempts: number | null;
  password_locked_until: string | null;
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
    .select("id, token, role, email, full_name, expires_at, revoked_at, used_at, created_by, password_hash, password_attempts, password_locked_until")
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
        has_password: !!inv.password_hash,
      },
    });
  }

  // Redeem: create the user, wire up the profile, and mark used.
  const passwordInput = String(body.password ?? "");
  const full_name = String(body.full_name ?? "").trim() || inv.full_name || null;
  if (!full_name || full_name.length < 2) return json(400, { error: "invalid_invite" });

  // Derive a unique username from the accepted name.
  const baseUsername = full_name
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    || `user-${inv.id.slice(0, 8)}`;

  let username = baseUsername;
  let suffix = 1;
  while (true) {
    const { data: clash } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (!clash) break;
    suffix += 1;
    username = `${baseUsername}${suffix}`;
    if (suffix > 200) return json(500, { error: "name_taken" });
  }

  // Synthesize a hidden email for auth. Reuse the invite's email if present (legacy).
  const email = inv.email || `${username}@users.mechatro.local`;

  // Preset-password gate.
  if (inv.password_hash) {
    if (inv.password_locked_until && new Date(inv.password_locked_until).getTime() > Date.now()) {
      return json(429, { error: "too_many_attempts" });
    }
    if (!passwordInput) return json(400, { error: "password_required" });
    const ok = await bcrypt.compare(passwordInput, inv.password_hash);
    if (!ok) {
      const attempts = (inv.password_attempts ?? 0) + 1;
      const lock = attempts >= 5
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : null;
      await admin.from("invites").update({
        password_attempts: attempts,
        password_locked_until: lock,
      }).eq("id", inv.id);
      return json(401, { error: "password_mismatch" });
    }
  } else {
    if (!passwordInput || passwordInput.length < 8) return json(400, { error: "password_too_short" });
  }

  // Create the auth user (email pre-confirmed).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: passwordInput,
    email_confirm: true,
    user_metadata: { full_name, invited_via: inv.id },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? "create_failed";
    if (/already/i.test(msg)) return json(409, { error: "name_taken" });
    return json(500, { error: msg });
  }

  const uid = created.user.id;

  // handle_new_user() already inserted a profile row; upgrade role/status + username here.
  const { data: updatedRows, error: profErr } = await admin.from("profiles").update({
    full_name,
    username,
    role: inv.role,
    status: "active",
    active: true,
    invited_by: inv.created_by,
    invited_at: new Date().toISOString(),
  }).eq("id", uid).select("id, status");
  if (profErr) {
    console.error("profile update failed", profErr.message);
    return json(500, { error: "profile_update_failed" });
  }
  if (!updatedRows || updatedRows.length === 0 || updatedRows[0].status !== "active") {
    console.error("profile did not activate", updatedRows);
    return json(500, { error: "profile_update_failed" });
  }

  // Mark the invite consumed.
  const { error: markErr } = await admin.from("invites").update({
    used_at: new Date().toISOString(),
    used_by: uid,
  }).eq("id", inv.id);
  if (markErr) console.warn("invite mark failed", markErr.message);

  return json(200, { ok: true, email, username });
});

