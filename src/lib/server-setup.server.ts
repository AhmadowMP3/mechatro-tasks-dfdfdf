import { createHash, timingSafeEqual } from "node:crypto";
import { useSession } from "@tanstack/react-start/server";

import setupHtml from "@/content/server-setup.page.html?raw";

export const SERVER_SETUP_HTML = setupHtml;

type GateSession = { unlocked?: boolean };

// Fallbacks keep the page working on self-hosted deployments where the
// optional env vars were not configured yet (otherwise the session helper
// throws and the whole route 500s).
const DEFAULT_PASSWORD = "Ghiath2026321!@#";

function setupPassword(): string {
  return process.env["SERVER_SETUP_PASSWORD"] || DEFAULT_PASSWORD;
}

function sessionSecret(): string {
  const fromEnv = process.env["SERVER_SETUP_SESSION_SECRET"];
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  // Deterministic 64-char secret derived from the gate password.
  return createHash("sha256")
    .update(`mechatro-server-setup:${setupPassword()}`, "utf8")
    .digest("hex");
}

function sessionConfig() {
  return {
    password: sessionSecret(),
    name: "server-setup-gate",
    maxAge: 60 * 60 * 12,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function isUnlocked(): Promise<boolean> {
  try {
    const session = await useSession<GateSession>(sessionConfig());
    return session.data.unlocked === true;
  } catch {
    return false;
  }
}

export async function unlock(password: string): Promise<boolean> {
  const expected = setupPassword();

  const a = createHash("sha256").update(password, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  if (!timingSafeEqual(a, b)) return false;

  try {
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true });
  } catch {
    // Session cookie could not be written (missing crypto env) — still allow
    // this request through; the user simply re-enters the password later.
  }
  return true;
}


export type VaultBlob = { ciphertext: string; iv: string; salt: string };

export async function loadVault(): Promise<VaultBlob | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("server_setup_vault")
    .select("ciphertext, iv, salt")
    .eq("id", true)
    .maybeSingle();
  return (data as VaultBlob | null) ?? null;
}

export async function saveVault(blob: VaultBlob): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("server_setup_vault")
    .upsert({ id: true, ...blob }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export function lockScreenHtml(error = false): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>دخول محمي — Mechatro</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root{--navy:#081320;--card:#0F2031;--blue:#42C2EE;--gold:#D4A017;--ink:#E6EEF7;--muted:#94A3B8;--border:#1E3A57;--input-bg:#0B1A2A}
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100vh;background:var(--navy);color:var(--ink);font-family:"Inter","Noto Sans Arabic",system-ui,sans-serif}
  body{display:flex;align-items:center;justify-content:center;padding:24px}
  .card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:32px;box-shadow:0 24px 60px rgba(0,0,0,.35);text-align:center}
  .logo{width:64px;height:64px;border-radius:16px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(66,194,238,.18),rgba(212,160,23,.18));border:1px solid var(--border);font-weight:700;font-size:22px;color:var(--blue);letter-spacing:1px}
  h1{font-size:20px;margin:0 0 6px}
  p{color:var(--muted);font-size:13px;margin:0 0 22px}
  input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--input-bg);color:var(--ink);font-size:15px;outline:none;direction:ltr;text-align:left}
  input:focus{border-color:var(--blue)}
  button{margin-top:14px;width:100%;padding:12px 14px;border-radius:12px;border:0;background:var(--blue);color:#04121d;font-weight:700;font-size:15px;cursor:pointer}
  button:hover{filter:brightness(1.05)}
  .err{margin-top:14px;color:#FCA5A5;font-size:13px}
</style>
</head>
<body>
  <form class="card" method="post">
    <div class="logo">M</div>
    <h1>بيانات إعداد السيرفر</h1>
    <p>هذه الصفحة محمية بكلمة مرور</p>
    <input type="password" name="password" placeholder="كلمة المرور" autocomplete="current-password" autofocus />
    <button type="submit">دخول</button>
    ${error ? `<div class="err">كلمة المرور غير صحيحة</div>` : ""}
  </form>
<script>
  // Keep the password in memory for this tab only: it is also the key that
  // decrypts the stored data. Nothing readable is ever persisted anywhere.
  document.querySelector("form").addEventListener("submit", function (e) {
    var v = document.querySelector('input[name="password"]').value;
    try { sessionStorage.setItem("mx_setup_key", v); } catch (err) {}
  });
</script>
</body>
</html>`;
}
