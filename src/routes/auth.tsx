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
  const [email, setEmail] = useState("");
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
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
        background: "linear-gradient(160deg,#050D17 0%,#0A1A2B 60%,#0E2338 100%)",
        color: "#EAF2F9",
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
        border: "1px solid #1E364D",
        borderRadius: 20, padding: 32,
        boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        backdropFilter: "blur(6px)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <img src={logo} alt="Mechatro" style={{ width: 200, marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: "#9FB7C9", fontWeight: 700 }}>{t("appName")}</div>
        </div>

        <div style={{
          padding: "10px 14px", marginBottom: 18,
          background: "rgba(29,155,240,.10)", border: "1px solid rgba(29,155,240,.3)",
          borderRadius: 10, fontSize: 12.5, color: "#B9CBDA", textAlign: "center",
        }}>
          {l ? "الدخول بالدعوة فقط. تواصل مع مسؤول النظام لطلب حساب." : "Invite-only access. Contact your master admin to request an account."}
        </div>

        <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={l ? "البريد الإلكتروني" : "Email"}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} dir="ltr" />
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
              background: "transparent", border: "none", color: "#9FB7C9",
              cursor: "pointer", fontSize: 12.5, padding: "8px 0", fontWeight: 600,
            }}
          >{l ? "طلب صلاحية الوصول" : "Request access"}</button>

          {showInfo && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: "#0F2033", border: "1px dashed #1E364D",
              fontSize: 12.5, color: "#B9CBDA", lineHeight: 1.7,
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
  background: "#13283D", color: "#EAF2F9",
  border: "1px solid #1E364D", fontSize: 14, minHeight: 44, outline: "none",
};
const pillBtn: React.CSSProperties = {
  minHeight: 40, padding: "0 14px", borderRadius: 999,
  background: "rgba(255,255,255,.08)", color: "#EAF2F9",
  border: "1px solid #1E364D", fontWeight: 700, fontSize: 13, cursor: "pointer",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#9FB7C9", fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}
