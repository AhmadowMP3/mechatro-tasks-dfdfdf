import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/security/db";
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
  const [showForgot, setShowForgot] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const l = lang === "ar";
  const isLight = theme === "light";

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

  // Theme-aware palette
  const pageBg = isLight
    ? "radial-gradient(circle at 85% 0%, #DDEAFB 0%, transparent 55%), radial-gradient(circle at 10% 100%, #E4F5EC 0%, transparent 55%), #F6F9FC"
    : "linear-gradient(160deg,var(--sidebar) 0%,var(--sidebar) 60%,#0E2338 100%)";
  const cardBg = isLight ? "#FFFFFF" : "rgba(10,26,43,.85)";
  const cardBorder = isLight ? "1px solid #E2E8F0" : "1px solid var(--border)";
  const cardShadow = isLight
    ? "0 1px 2px rgba(15,32,49,.04), 0 24px 60px -20px rgba(24,100,180,.22)"
    : "0 24px 60px rgba(0,0,0,.5)";
  const subtitleColor = isLight ? "#5A6B7D" : "var(--muted)";
  const bannerBg = isLight ? "#F1F7FE" : "rgba(29,155,240,.10)";
  const bannerBorder = isLight ? "1px solid #BFDBFA" : "1px solid rgba(29,155,240,.3)";
  const bannerText = isLight ? "#1E3A5F" : "var(--muted)";
  const inputBg = isLight ? "#F5F8FB" : "var(--surface-3)";
  const inputBorder = isLight ? "#D7DEE5" : "var(--border)";
  const inputText = isLight ? "#0F2031" : "var(--foreground)";
  const labelColor = isLight ? "#5A6B7D" : "var(--muted)";
  const ghostColor = isLight ? "#5A6B7D" : "var(--muted)";
  const glow1 = isLight ? "rgba(29,155,240,.14)" : "rgba(29,155,240,.25)";
  const glow2 = isLight ? "rgba(48,192,116,.10)" : "rgba(48,192,116,.18)";

  const pillBtnStyle: React.CSSProperties = {
    minHeight: 40, padding: "0 14px", borderRadius: 999,
    background: isLight ? "#FFFFFF" : "rgba(255,255,255,.08)",
    color: isLight ? "#0F2031" : "var(--foreground)",
    border: isLight ? "1px solid #E2E8F0" : "1px solid var(--border)",
    fontWeight: 700, fontSize: 13, cursor: "pointer",
    boxShadow: isLight ? "0 1px 2px rgba(15,32,49,.04)" : "none",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    background: inputBg, color: inputText,
    border: `1px solid ${inputBorder}`, fontSize: 14, minHeight: 44, outline: "none",
    transition: "border-color .15s ease, box-shadow .15s ease",
  };

  function onInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = "#1D9BF0";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,155,240,.18)";
  }
  function onInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = inputBorder;
    e.currentTarget.style.boxShadow = "none";
  }

  return (
    <div
      data-theme={theme}
      dir={l ? "rtl" : "ltr"}
      style={{
        minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        background: pageBg,
        color: isLight ? "#0F2031" : "var(--foreground)",
        fontFamily: l ? "'Almarai', system-ui, sans-serif" : "'Montserrat', system-ui, sans-serif",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Decorative glows */}
      <div style={{
        position: "absolute", top: "-20%", insetInlineEnd: "-10%",
        width: 480, height: 480, borderRadius: "50%",
        background: `radial-gradient(circle, ${glow1}, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-25%", insetInlineStart: "-10%",
        width: 520, height: 520, borderRadius: "50%",
        background: `radial-gradient(circle, ${glow2}, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ position: "absolute", top: 16, insetInlineEnd: 16, display: "flex", gap: 8, zIndex: 2 }}>
        <button onClick={() => setLang(l ? "en" : "ar")} style={pillBtnStyle}>{l ? "English" : "عربي"}</button>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={pillBtnStyle}>
          {theme === "dark" ? "☀︎" : "☾"}
        </button>
      </div>

      <div style={{
        position: "relative",
        width: "100%", maxWidth: 440, zIndex: 1,
        background: cardBg,
        border: cardBorder,
        borderRadius: 20, padding: 32,
        boxShadow: cardShadow,
        backdropFilter: isLight ? "none" : "blur(6px)",
        overflow: "hidden",
      }}>
        {/* Cool blue accent stroke on top edge */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, #1D9BF0, transparent)",
          opacity: isLight ? 0.9 : 0.5,
          pointerEvents: "none",
        }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <img src={logo} alt="Mechatro" style={{ width: 200, marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: subtitleColor, fontWeight: 700 }}>{t("appName")}</div>
        </div>

        <div style={{
          padding: "10px 14px", marginBottom: 18,
          background: bannerBg, border: bannerBorder,
          borderRadius: 10, fontSize: 12.5, color: bannerText, textAlign: "center",
        }}>
          {l ? "الدخول بالدعوة فقط. اطلب من مسؤول النظام إنشاء رابط دعوة لك." : "Invite-only access. Ask your master admin for an invite link."}
        </div>

        <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={l ? "الاسم" : "Name"} color={labelColor}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="username" style={inputStyle} dir="ltr" onFocus={onInputFocus} onBlur={onInputBlur} />
          </Field>

          <Field label={l ? "كلمة المرور" : "Password"} color={labelColor}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={inputStyle} dir="ltr" onFocus={onInputFocus} onBlur={onInputBlur} />
          </Field>

          <button
            type="submit"
            disabled={busy}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              marginTop: 6, minHeight: 48, borderRadius: 12,
              background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
              color: "#fff", fontWeight: 800, fontSize: 15,
              border: "none", cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.6 : 1,
              transform: btnHover && !busy ? "translateY(-1px)" : "translateY(0)",
              boxShadow: btnHover && !busy
                ? "0 10px 24px -8px rgba(29,155,240,.55)"
                : "0 4px 12px -6px rgba(29,155,240,.4)",
              transition: "transform .15s ease, box-shadow .15s ease, opacity .15s ease",
            }}
          >{busy ? "…" : (l ? "تسجيل الدخول" : "Sign in")}</button>

          <button
            type="button"
            onClick={() => setShowForgot(true)}
            style={{
              background: "transparent", border: "none", color: ghostColor,
              cursor: "pointer", fontSize: 12.5, padding: "4px 0", fontWeight: 700,
            }}
          >{l ? "نسيت كلمة المرور؟" : "Forgot your password?"}</button>

          <button
            type="button"
            onClick={() => setShowInfo((s) => !s)}
            style={{
              background: "transparent", border: "none", color: ghostColor,
              cursor: "pointer", fontSize: 12.5, padding: "8px 0", fontWeight: 600,
              textDecoration: "none",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
          >{l ? "طلب صلاحية الوصول" : "Request access"}</button>


          {showInfo && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: isLight ? "#F8FAFC" : "var(--card)",
              border: isLight ? "1px dashed #CBD5E1" : "1px dashed var(--border)",
              fontSize: 12.5, color: isLight ? "#475569" : "var(--muted)", lineHeight: 1.7,
            }}>
              {l
                ? "أرسل بريدًا إلى مسؤول النظام في ميكاترو مع اسمك الكامل والقسم المطلوب. سيقوم بإصدار دعوة تفعيل الحساب على بريدك."
                : "Email the Mechatro master admin with your full name and department. They will send an activation invite to your inbox."}
            </div>
          )}
        </form>
      </div>

      {showForgot && <ForgotPasswordModal lang={lang} onClose={() => setShowForgot(false)} />}
    </div>
  );
}

function ForgotPasswordModal({ lang, onClose }: { lang: "ar" | "en"; onClose: () => void }) {
  const l = lang === "ar";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      toast.error(l ? "أدخل إيميل استرجاع صالح." : "Enter a valid recovery email.");
      return;
    }
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir={l ? "rtl" : "ltr"}
        style={{
          width: "100%", maxWidth: 400, background: "var(--sidebar)",
          border: "1px solid var(--border)", borderRadius: 16, padding: 20,
          color: "var(--foreground)", boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
          {l ? "نسيت كلمة المرور" : "Forgot password"}
        </div>
        {sent ? (
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
            {l
              ? "إذا كان هذا الإيميل مسجّلاً كإيميل استرجاع لأحد الحسابات، فقد أُرسل إليه رابط إعادة التعيين. تحقّق من بريدك (وصندوق الرسائل غير المرغوبة)."
              : "If this address is registered as a recovery email, a reset link has been sent to it. Check your inbox (and spam)."}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.8, marginBottom: 12 }}>
              {l
                ? "أدخل إيميل الاسترجاع الذي حفظته في إعدادات حسابك، وسنرسل لك رابط إعادة تعيين كلمة المرور."
                : "Enter the recovery email saved in your account settings and we'll send you a reset link."}
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              autoFocus
              placeholder="name@example.com"
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 10,
                background: "var(--surface-3)", color: "var(--foreground)",
                border: "1px solid var(--border)", fontSize: 14, minHeight: 44, outline: "none",
              }}
            />
          </>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {!sent && (
            <button
              onClick={send}
              disabled={busy}
              style={{
                flex: 1, minHeight: 44, borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)", color: "#fff",
                fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
              }}
            >{busy ? "…" : (l ? "إرسال الرابط" : "Send link")}</button>
          )}
          <button
            onClick={onClose}
            style={{
              minHeight: 44, padding: "0 16px", borderRadius: 10, background: "transparent",
              color: "var(--foreground)", border: "1px solid var(--border)", fontWeight: 700, cursor: "pointer",
              flex: sent ? 1 : undefined,
            }}
          >{sent ? (l ? "تم" : "Done") : (l ? "إلغاء" : "Cancel")}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

