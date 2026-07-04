import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { ShieldCheck, User as UserIcon, Sparkles, Lock, Mail, Loader2, AlertTriangle } from "lucide-react";
import logo from "@/assets/mechatro-logo.png";

const searchSchema = z.object({ token: z.string().catch("").default("") });

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "قبول الدعوة · Mechatro Tasks" },
      { name: "description", content: "Activate your Mechatro Tasks account" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptInvitePage,
});

type PeekResult = {
  role: "admin" | "member";
  email: string | null;
  full_name: string | null;
  expires_at: string | null;
  is_email_locked: boolean;
  has_password: boolean;
};

const ERROR_MAP: Record<string, { ar: string; en: string }> = {
  invalid_invite:   { ar: "رابط الدعوة غير صالح.",        en: "This invite link is not valid." },
  invite_revoked:   { ar: "تم إلغاء هذه الدعوة.",         en: "This invite has been revoked." },
  invite_used:      { ar: "تم استخدام هذه الدعوة مسبقًا.", en: "This invite has already been used." },
  invite_expired:   { ar: "انتهت صلاحية الدعوة.",         en: "This invite has expired." },
  email_required:   { ar: "البريد الإلكتروني مطلوب.",     en: "Email is required." },
  email_mismatch:   { ar: "البريد لا يطابق الدعوة.",      en: "Email does not match the invite." },
  email_taken:      { ar: "هذا البريد مسجّل مسبقًا.",     en: "This email is already registered." },
  password_too_short: { ar: "كلمة المرور قصيرة (٨ أحرف على الأقل).", en: "Password must be at least 8 characters." },
  password_required: { ar: "كلمة المرور مطلوبة.",         en: "Password is required." },
  password_mismatch: { ar: "كلمة المرور غير صحيحة.",       en: "That password is incorrect." },
  too_many_attempts: { ar: "محاولات كثيرة. حاول لاحقًا.",  en: "Too many attempts. Try again later." },
  token_required:   { ar: "الرابط ناقص.",                 en: "Invite link is incomplete." },
};

function translate(code: string | undefined, l: boolean): string {
  if (!code) return l ? "حدث خطأ." : "Something went wrong.";
  const e = ERROR_MAP[code];
  return e ? (l ? e.ar : e.en) : code;
}

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const { lang, setLang, theme, setTheme } = useApp();
  const l = lang === "ar";
  const navigate = useNavigate();

  const [peek, setPeek] = useState<PeekResult | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setPeekError("token_required"); setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("redeem-invite", {
          body: { mode: "peek", token },
        });
        if (error) {
          // Try to parse the response body for a structured error
          const ctx = (error as { context?: Response }).context;
          let code = "invalid_invite";
          try { if (ctx) code = ((await ctx.json()) as { error?: string })?.error ?? code; } catch { /* noop */ }
          setPeekError(code);
        } else {
          const p = (data as { invite?: PeekResult })?.invite;
          if (!p) { setPeekError("invalid_invite"); }
          else {
            setPeek(p);
            setFullName(p.full_name ?? "");
            setEmail(p.email ?? "");
          }
        }
      } catch (e) {
        setPeekError(e instanceof Error ? e.message : "invalid_invite");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!peek) return;
    const name = fullName.trim();
    if (name.length < 2 || name.length > 80) {
      toast.error(l ? "الاسم الكامل يجب أن يكون بين 2 و 80 حرفًا." : "Full name must be between 2 and 80 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-invite", {
        body: {
          mode: "redeem",
          token,
          email: peek.is_email_locked ? peek.email : email.trim().toLowerCase(),
          full_name: fullName.trim(),
          password,
        },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        let code = "invalid_invite";
        try { if (ctx) code = ((await ctx.json()) as { error?: string })?.error ?? code; } catch { /* noop */ }
        throw new Error(translate(code, l));
      }
      const finalEmail = (data as { email?: string })?.email ?? (peek.email ?? email.trim().toLowerCase());
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: finalEmail, password,
      });
      if (signInErr) throw signInErr;
      toast.success(l ? "مرحبًا بك في ميكاترو" : "Welcome to Mechatro");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
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
      <div style={{
        position: "absolute", top: "-20%", insetInlineEnd: "-10%",
        width: 520, height: 520, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(240,180,41,.20), transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-25%", insetInlineStart: "-10%",
        width: 520, height: 520, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(29,155,240,.22), transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "absolute", top: 16, insetInlineEnd: 16, display: "flex", gap: 8, zIndex: 2 }}>
        <button onClick={() => setLang(l ? "en" : "ar")} style={pillBtn}>{l ? "English" : "عربي"}</button>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={pillBtn}>
          {theme === "dark" ? "☀︎" : "☾"}
        </button>
      </div>

      <div style={{
        width: "100%", maxWidth: 460, zIndex: 1,
        background: "rgba(10,26,43,.88)",
        border: "1px solid var(--border)",
        borderRadius: 20, padding: 32,
        boxShadow: "0 24px 60px rgba(0,0,0,.55)",
        backdropFilter: "blur(6px)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
          <img src={logo} alt="Mechatro" style={{ width: 180, marginBottom: 10 }} />
          <div style={{
            display: "inline-flex", gap: 6, alignItems: "center",
            fontSize: 12, color: "#F0B429", fontWeight: 800, letterSpacing: 0.5,
          }}>
            <Sparkles size={13} />
            {l ? "دعوة انضمام" : "YOU'RE INVITED"}
          </div>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
            <Loader2 size={28} style={{ animation: "spin 1s linear infinite", opacity: .8 }} />
            <div style={{ marginTop: 10, fontSize: 13 }}>{l ? "جارِ التحقق من الرابط…" : "Verifying invite…"}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && peekError && (
          <div style={{
            padding: 20, borderRadius: 12, textAlign: "center",
            background: "rgba(240,103,106,.10)", border: "1px solid rgba(240,103,106,.35)",
            color: "#F0A0A0",
          }}>
            <AlertTriangle size={32} style={{ marginBottom: 8, color: "#F0676A" }} />
            <div style={{ fontWeight: 800, fontSize: 15, color: "#F0676A" }}>
              {l ? "تعذّر فتح الدعوة" : "Invite not available"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>{translate(peekError, l)}</div>
            <button onClick={() => navigate({ to: "/auth" })} style={{ ...primaryBtn, marginTop: 16 }}>
              {l ? "الذهاب إلى تسجيل الدخول" : "Go to sign in"}
            </button>
          </div>
        )}

        {!loading && peek && (
          <>
            <div style={{
              padding: "12px 14px", marginBottom: 16, borderRadius: 12,
              background: "rgba(29,155,240,.10)", border: "1px solid rgba(29,155,240,.30)",
              display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--muted)",
            }}>
              <ShieldCheck size={18} color="#1D9BF0" />
              <div>
                {peek.full_name ? (
                  <>
                    {l ? "أهلًا " : "Welcome, "}
                    <strong style={{ color: "var(--foreground)" }}>{peek.full_name}</strong>
                    {" — "}
                  </>
                ) : null}
                {l ? "تم دعوتك لتصبح" : "you've been invited as"}
                {" "}
                <strong style={{ color: peek.role === "admin" ? "#F0B429" : "var(--foreground)" }}>
                  {peek.role === "admin" ? (l ? "نائب مدير" : "Admin") : (l ? "عضو" : "Member")}
                </strong>
                {peek.expires_at && (
                  <div style={{ fontSize: 11.5, color: "#7A94A9", marginTop: 2 }}>
                    {l ? "صالحة حتى " : "Valid until "} {new Date(peek.expires_at).toLocaleString(l ? "ar-EG" : "en-US")}
                  </div>
                )}
              </div>
            </div>

            {peek.has_password && (
              <div style={{
                padding: "10px 12px", marginBottom: 12, borderRadius: 10,
                background: "rgba(240,180,41,.08)", border: "1px dashed rgba(240,180,41,.35)",
                fontSize: 12.5, color: "#F0B429", display: "flex", gap: 8, alignItems: "center",
              }}>
                <Lock size={14} />
                {l
                  ? "أدخل كلمة المرور التي أرسلها لك المدير لتفعيل حسابك."
                  : "Enter the password your admin sent you to activate the account."}
              </div>
            )}

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label={l ? "الاسم الكامل" : "Full name"} icon={UserIcon}>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                  required style={inputStyle} placeholder={l ? "مثال: أحمد محمود" : "e.g. Ahmed Mahmoud"} />
              </Field>
              <Field label={l ? "البريد الإلكتروني" : "Email"} icon={Mail}>
                <input type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required readOnly={peek.is_email_locked}
                  style={{ ...inputStyle, opacity: peek.is_email_locked ? 0.75 : 1, cursor: peek.is_email_locked ? "not-allowed" : "text" }}
                  dir="ltr" />
              </Field>
              <Field
                label={peek.has_password
                  ? (l ? "كلمة المرور المُرسَلة إليك" : "Password from your admin")
                  : (l ? "كلمة المرور (٨ أحرف على الأقل)" : "Password (min 8 characters)")}
                icon={Lock}
              >
                <input type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required minLength={peek.has_password ? 1 : 8} style={inputStyle} dir="ltr"
                  autoComplete={peek.has_password ? "current-password" : "new-password"} />
              </Field>

              <button type="submit" disabled={submitting} style={{
                marginTop: 8, minHeight: 48, borderRadius: 12,
                background: "linear-gradient(135deg,#F0B429,#F09F26)",
                color: "#1A1408", fontWeight: 900, fontSize: 15,
                border: "none", cursor: submitting ? "wait" : "pointer",
                opacity: submitting ? 0.7 : 1,
                boxShadow: "0 8px 24px rgba(240,180,41,.35)",
              }}>{submitting ? (l ? "جارِ التفعيل…" : "Activating…") : (l ? "تفعيل الحساب والدخول" : "Activate & sign in")}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon size={12} />{label}
      </span>
      {children}
    </label>
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
const primaryBtn: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 10,
  background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)", color: "#fff",
  border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
};
