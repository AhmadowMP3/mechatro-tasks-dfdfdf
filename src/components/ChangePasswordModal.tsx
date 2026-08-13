import { useState } from "react";
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
            position: "absolute", insetInlineEnd: 8, top: "50%", transform: "translateY(-50%)",
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
  const [busy, setBusy] = useState(false);

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

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PasswordField label={l ? "كلمة المرور الحالية" : "Current password"} value={current} onChange={setCurrent} autoFocus />
          <PasswordField label={l ? "كلمة المرور الجديدة" : "New password"} value={next} onChange={setNext} />
          <PasswordField label={l ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"} value={confirmPw} onChange={setConfirmPw} />
        </div>

        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
          {l ? "8 أحرف على الأقل." : "At least 8 characters."}
        </div>

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
      </div>
    </div>,
    document.body,
  );
}
