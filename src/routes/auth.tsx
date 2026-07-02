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

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in, bounce to app
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const l = lang === "ar";


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(l ? "تم تسجيل الدخول" : "Signed in");
        navigate({ to: "/" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success(l ? "تم إنشاء الحساب" : "Account created");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success(l ? "أُرسل رابط إعادة التعيين" : "Reset link sent");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const label = {
    signin: { ar: "تسجيل الدخول", en: "Sign in" },
    signup: { ar: "إنشاء حساب", en: "Sign up" },
    forgot: { ar: "استعادة كلمة المرور", en: "Reset password" },
  } as const;

  return (
    <div
      dir={l ? "rtl" : "ltr"}
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "linear-gradient(160deg,#050D17 0%,#0A1A2B 60%,#0E2338 100%)",
        color: "#EAF2F9",
        fontFamily: l ? "'Almarai', system-ui, sans-serif" : "'Montserrat', system-ui, sans-serif",
      }}
    >
      <div style={{ position: "absolute", top: 16, insetInlineEnd: 16, display: "flex", gap: 8 }}>
        <button
          onClick={() => setLang(l ? "en" : "ar")}
          style={pillBtn}
        >{l ? "English" : "عربي"}</button>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={pillBtn}
        >{theme === "dark" ? "☀︎" : "☾"}</button>
      </div>

      <div style={{
        width: "100%", maxWidth: 440,
        background: "rgba(10,26,43,.85)",
        border: "1px solid #1E364D",
        borderRadius: 20,
        padding: 32,
        boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        backdropFilter: "blur(6px)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <img src={logo} alt="Mechatro" style={{ width: 200, marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: "#9FB7C9", fontWeight: 700 }}>{t("appName")}</div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: "#13283D", borderRadius: 12, padding: 3, marginBottom: 20 }}>
          {(["signin", "signup", "forgot"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, minHeight: 40, borderRadius: 10,
                background: mode === m ? "var(--grad-blue, linear-gradient(135deg,#1D9BF0,#0F6BB8))" : "transparent",
                color: mode === m ? "#fff" : "#B9CBDA",
                border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12.5,
              }}
            >{label[m][lang]}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <Field label={l ? "الاسم الكامل" : "Full name"}>
              <input
                type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                required style={inputStyle}
              />
            </Field>
          )}
          <Field label={l ? "البريد الإلكتروني" : "Email"}>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required style={inputStyle} dir="ltr"
            />
          </Field>
          {mode !== "forgot" && (
            <Field label={l ? "كلمة المرور" : "Password"}>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={6} style={inputStyle} dir="ltr"
              />
            </Field>
          )}

          <button
            type="submit" disabled={busy}
            style={{
              marginTop: 6, minHeight: 48, borderRadius: 12,
              background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
              color: "#fff", fontWeight: 800, fontSize: 15,
              border: "none", cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >{busy ? "…" : label[mode][lang]}</button>
        </form>

      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  background: "#13283D", color: "#EAF2F9",
  border: "1px solid #1E364D", fontSize: 14, minHeight: 44,
  outline: "none",
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.9 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41 34.6 44 29.7 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
