import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import logo from "@/assets/mechatro-logo.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول · Mechatro Tasks" },
      { name: "description", content: "Sign in to Mechatro Tasks" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const l = lang === "ar";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error(l ? "الاسم مطلوب" : "Name is required");

      const { data: resolved, error: rpcErr } = await supabase
        .rpc("resolve_login_email", { p_name: trimmed });
      if (rpcErr) throw rpcErr;
      const loginEmail = typeof resolved === "string" ? resolved : null;
      if (!loginEmail) {
        // Distinguish "not activated / suspended" from "wrong credentials" so the
        // client knows to open their invite link instead of retrying passwords.
        const { data: pendingHit } = await supabase
          .from("profiles")
          .select("status")
          .or(`username.ilike.${trimmed},full_name.ilike.${trimmed}`)
          .limit(1)
          .maybeSingle();
        if (pendingHit?.status === "pending") {
          throw new Error(l
            ? "لم يتم تفعيل هذا الحساب بعد. افتح رابط الدعوة المُرسل إليك أولًا."
            : "This account isn't activated yet. Open the invite link you were sent first.");
        }
        if (pendingHit?.status === "suspended") {
          throw new Error(l ? "الحساب موقوف. تواصل مع المدير." : "Account suspended. Contact the admin.");
        }
        throw new Error(l ? "الاسم أو كلمة المرور غير صحيحة" : "Invalid name or password");
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) {
        // Mask provider error to avoid confirming which half was wrong.
        throw new Error(l ? "الاسم أو كلمة المرور غير صحيحة" : "Invalid name or password");
      }
      if (data.user) {
        const recentWindow = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentLogin } = await supabase
          .from("activity_log")
          .select("id")
          .eq("actor_id", data.user.id)
          .eq("action", "signed_in")
          .gte("created_at", recentWindow)
          .maybeSingle();

        if (!recentLogin) {
          void supabase.from("activity_log").insert({
            actor_id: data.user.id, action: "signed_in", entity_type: "auth", entity_id: data.user.id, meta: { source: "password_login" },
          });
        }
      }
      toast.success(l ? "تم تسجيل الدخول" : "Signed in");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }


  return (
    <div
      dir={l ? "rtl" : "ltr"}
      style={{
        minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        background: "linear-gradient(160deg,var(--sidebar) 0%,var(--sidebar) 60%,#0E2338 100%)",
        color: "var(--foreground)",
        fontFamily: l ? "'Almarai', system-ui, sans-serif" : "'Montserrat', system-ui, sans-serif",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Decorative glow */}
      <div style={{
        position: "absolute", top: "-20%", insetInlineEnd: "-10%",
        width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(29,155,240,.25), transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-25%", insetInlineStart: "-10%",
        width: 520, height: 520, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(48,192,116,.18), transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "absolute", top: 16, insetInlineEnd: 16, display: "flex", gap: 8, zIndex: 2 }}>
        <button onClick={() => setLang(l ? "en" : "ar")} style={pillBtn}>{l ? "English" : "عربي"}</button>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={pillBtn}>
          {theme === "dark" ? "☀︎" : "☾"}
        </button>
      </div>

      <div style={{
        width: "100%", maxWidth: 440, zIndex: 1,
        background: "rgba(10,26,43,.85)",
        border: "1px solid var(--border)",
        borderRadius: 20, padding: 32,
        boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        backdropFilter: "blur(6px)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <img src={logo} alt="Mechatro" style={{ width: 200, marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>{t("appName")}</div>
        </div>

        <div style={{
          padding: "10px 14px", marginBottom: 18,
          background: "rgba(29,155,240,.10)", border: "1px solid rgba(29,155,240,.3)",
          borderRadius: 10, fontSize: 12.5, color: "var(--muted)", textAlign: "center",
        }}>
          {l ? "الدخول بالدعوة فقط. اطلب من مسؤول النظام إنشاء رابط دعوة لك." : "Invite-only access. Ask your master admin for an invite link."}
        </div>

        <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={l ? "الاسم" : "Name"}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="username" style={inputStyle} dir="ltr" />
          </Field>

          <Field label={l ? "كلمة المرور" : "Password"}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={inputStyle} dir="ltr" />
          </Field>

          <button type="submit" disabled={busy} style={{
            marginTop: 6, minHeight: 48, borderRadius: 12,
            background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
            color: "#fff", fontWeight: 800, fontSize: 15,
            border: "none", cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}>{busy ? "…" : (l ? "تسجيل الدخول" : "Sign in")}</button>

          <button
            type="button"
            onClick={() => setShowInfo((s) => !s)}
            style={{
              background: "transparent", border: "none", color: "var(--muted)",
              cursor: "pointer", fontSize: 12.5, padding: "8px 0", fontWeight: 600,
            }}
          >{l ? "طلب صلاحية الوصول" : "Request access"}</button>

          {showInfo && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: "var(--card)", border: "1px dashed var(--border)",
              fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7,
            }}>
              {l
                ? "أرسل بريدًا إلى مسؤول النظام في ميكاترو مع اسمك الكامل والقسم المطلوب. سيقوم بإصدار دعوة تفعيل الحساب على بريدك."
                : "Email the Mechatro master admin with your full name and department. They will send an activation invite to your inbox."}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  background: "var(--surface-3)", color: "var(--foreground)",
  border: "1px solid var(--border)", fontSize: 14, minHeight: 44, outline: "none",
};
const pillBtn: React.CSSProperties = {
  minHeight: 40, padding: "0 14px", borderRadius: 999,
  background: "rgba(255,255,255,.08)", color: "var(--foreground)",
  border: "1px solid var(--border)", fontWeight: 700, fontSize: 13, cursor: "pointer",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}
