import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/security/db";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 40px 12px 14px", borderRadius: 10,
  background: "var(--surface-3)", color: "var(--foreground)",
  border: "1px solid var(--border)", fontSize: 14, minHeight: 44, outline: "none",
};

function PasswordField({ label, value, onChange, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{label}</span>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          dir="ltr"
          autoComplete="off"
          maxLength={72}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide" : "Show"}
          style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer",
            padding: 4, display: "inline-flex",
          }}
        >{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
    </label>
  );
}

export function ChangePasswordModal({ lang, onClose }: { lang: "ar" | "en"; onClose: () => void }) {
  const l = lang === "ar";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [recovery, setRecovery] = useState("");
  const [savedRecovery, setSavedRecovery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
      const { data } = await supabase
        .from("profiles").select("recovery_email").eq("id", me.user.id).maybeSingle();
      if (!alive) return;
      const value = (data as { recovery_email?: string | null } | null)?.recovery_email ?? "";
      setSavedRecovery(value || null);
      setRecovery(value);
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    if (next.length < 8) {
      toast.error(l ? "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل." : "New password must be at least 8 characters.");
      return;
    }
    if (next !== confirmPw) {
      toast.error(l ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
      return;
    }
    if (next === current) {
      toast.error(l ? "كلمة المرور الجديدة يجب أن تختلف عن الحالية." : "New password must differ from the current one.");
      return;
    }
    setBusy(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      const email = me.user?.email;
      if (!email) throw new Error(l ? "تعذّر التحقق من الحساب." : "Could not verify your account.");

      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyErr) throw new Error(l ? "كلمة المرور الحالية غير صحيحة." : "Current password is incorrect.");

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw new Error(l ? "تعذّر تحديث كلمة المرور. حاول مرة أخرى." : "Could not update the password. Please try again.");

      if (me.user) {
        void supabase.from("activity_log").insert({
          actor_id: me.user.id, action: "password_changed",
          entity_type: "auth", entity_id: me.user.id, meta: { source: "self_service" },
        });
      }
      toast.success(l ? "تم تغيير كلمة المرور" : "Password changed");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendRecovery() {
    const value = recovery.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      toast.error(l ? "أدخل إيميل استرجاع صالح." : "Enter a valid recovery email.");
      return;
    }
    setBusy(true);
    try {
      if (value !== (savedRecovery ?? "").toLowerCase()) {
        const { data: res, error: recErr } = await supabase.functions.invoke("admin-users", {
          body: { action: "set_recovery_email", email: value },
        });
        const failed = recErr || (res as { error?: string } | null)?.error;
        if (failed) throw new Error(l ? "تعذّر حفظ إيميل الاسترجاع." : "Could not save the recovery email.");
        setSavedRecovery(value);
      }
      await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      toast.success(l
        ? "تم إرسال رابط إعادة التعيين على إيميلك. تفقّد صندوق الوارد (والسبام)."
        : "A reset link was sent to your email. Check your inbox (and spam).");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }



  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir={l ? "rtl" : "ltr"}
        style={{
          width: "100%", maxWidth: 420,
          background: "var(--sidebar)", border: "1px solid var(--border)", borderRadius: 16,
          padding: 20, color: "var(--foreground)",
          boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)", display: "grid", placeItems: "center",
          }}><KeyRound size={17} color="#fff" /></div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{l ? "تغيير كلمة المرور" : "Change password"}</div>
        </div>

        {mode === "change" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <PasswordField label={l ? "كلمة المرور الحالية" : "Current password"} value={current} onChange={setCurrent} autoFocus />
              <PasswordField label={l ? "كلمة المرور الجديدة" : "New password"} value={next} onChange={setNext} />
              <PasswordField label={l ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"} value={confirmPw} onChange={setConfirmPw} />
            </div>

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
              {l ? "8 أحرف على الأقل." : "At least 8 characters."}
            </div>

            <button
              type="button"
              onClick={() => setMode("recover")}
              style={{
                marginTop: 10, background: "transparent", border: "none", padding: 0,
                color: "#1D9BF0", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}
            >{l ? "نسيت كلمة المرور الحالية؟" : "Forgot your current password?"}</button>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={save}
                disabled={busy}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 10,
                  background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
                  color: "#fff", border: "none", fontWeight: 800, cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >{busy ? "…" : (l ? "حفظ" : "Save")}</button>
              <button
                onClick={onClose}
                disabled={busy}
                style={{
                  minHeight: 44, padding: "0 16px", borderRadius: 10,
                  background: "transparent", color: "var(--foreground)",
                  border: "1px solid var(--border)", fontWeight: 700, cursor: "pointer",
                }}
              >{l ? "إلغاء" : "Cancel"}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.8, marginBottom: 12 }}>
              {l
                ? "أدخل إيميل الاسترجاع الخاص بك. رح نحفظه على حسابك ونبعتلك عليه رابط إعادة تعيين كلمة المرور."
                : "Enter your recovery email. We'll save it to your account and send you a password reset link."}
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                {l ? "إيميل الاسترجاع" : "Recovery email"}
              </span>
              <input
                type="email"
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                dir="ltr"
                placeholder="name@example.com"
                autoComplete="email"
                maxLength={200}
                style={{ ...inputStyle, padding: "12px 14px" }}
              />
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={sendRecovery}
                disabled={busy}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 10,
                  background: "linear-gradient(135deg,#1D9BF0,#0F6BB8)",
                  color: "#fff", border: "none", fontWeight: 800, cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >{busy ? "…" : (l ? "إرسال رابط الاسترجاع" : "Send reset link")}</button>
              <button
                onClick={() => setMode("change")}
                disabled={busy}
                style={{
                  minHeight: 44, padding: "0 16px", borderRadius: 10,
                  background: "transparent", color: "var(--foreground)",
                  border: "1px solid var(--border)", fontWeight: 700, cursor: "pointer",
                }}
              >{l ? "رجوع" : "Back"}</button>
            </div>
          </>
        )}

      </div>
    </div>,
    document.body,
  );
}
