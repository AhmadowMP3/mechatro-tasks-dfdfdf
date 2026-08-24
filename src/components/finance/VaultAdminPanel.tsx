import { useState } from "react";
import { KeyRound, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useFinanceVault } from "@/lib/finance/vault-context";
import { passwordStrength } from "@/lib/finance/lock";

const T = {
  title: { ar: "كلمة سر المالية", en: "Finance password" },
  intro: {
    ar: "كلمة السر هذه تفتح قسم المالية فقط ولا تشفّر أي بيانات. تغييرها أو إعادة تعيينها لا يؤثر على أي سجل مالي.",
    en: "This password only opens the finance section; it does not encrypt anything. Changing or resetting it never affects finance records.",
  },
  current: { ar: "كلمة السر الحالية", en: "Current password" },
  next: { ar: "كلمة السر الجديدة", en: "New password" },
  confirm: { ar: "تأكيد الجديدة", en: "Confirm new password" },
  change: { ar: "تغيير كلمة السر", en: "Change password" },
  resetTitle: { ar: "نسيت كلمة السر؟", en: "Forgot the password?" },
  resetBody: {
    ar: "إعادة التعيين تمسح كلمة السر الحالية فقط، ثم تُطلب منك كلمة جديدة عند فتح المالية. لا تُفقد أي بيانات.",
    en: "Resetting only clears the current password; you will be asked to set a new one when opening finance. No data is lost.",
  },
  reset: { ar: "إعادة التعيين وتعيين كلمة جديدة", en: "Reset and set a new password" },
  done: { ar: "تم بنجاح.", en: "Done." },
  wrong: { ar: "كلمة السر الحالية غير صحيحة.", en: "Current password is incorrect." },
  mismatch: { ar: "كلمتا السر غير متطابقتين.", en: "Passwords do not match." },
  weak: { ar: "استخدم 8 أحرف على الأقل.", en: "Use at least 8 characters." },
  strength: {
    ar: ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"],
    en: ["Very weak", "Weak", "Fair", "Good", "Strong"],
  },
};

const wrap: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 11,
  border: "1px solid var(--border)",
  background: "var(--surface-1)",
  color: "var(--foreground)",
  fontSize: 15,
};

const primary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 11,
  border: "none",
  background: "var(--grad-blue)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const ghost: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 11,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--foreground)",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

export function VaultAdminPanel() {
  const { lang } = useApp();
  const ar = lang === "ar";
  const t = <K extends keyof typeof T>(k: K) => (ar ? T[k].ar : T[k].en) as string;
  const { status, changePassword, resetPassword } = useFinanceVault();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submitChange(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) return setMsg({ kind: "err", text: t("weak") });
    if (next !== confirm) return setMsg({ kind: "err", text: t("mismatch") });
    setBusy(true);
    try {
      const ok = await changePassword(current, next);
      if (!ok) setMsg({ kind: "err", text: t("wrong") });
      else {
        setMsg({ kind: "ok", text: t("done") });
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    } catch (err: any) {
      setMsg({ kind: "err", text: String(err?.message ?? err) });
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setMsg(null);
    setBusy(true);
    try {
      await resetPassword();
      setMsg({ kind: "ok", text: t("done") });
    } catch (err: any) {
      setMsg({ kind: "err", text: String(err?.message ?? err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={wrap} dir={ar ? "rtl" : "ltr"}>
      <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontSize: 18 }}>
        <KeyRound size={19} /> {t("title")}
      </h3>
      <p style={{ margin: 0, color: "var(--muted-foreground)", lineHeight: 1.7, fontSize: 14 }}>{t("intro")}</p>

      {status !== "not_set" && (
        <form onSubmit={submitChange} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{t("current")}</span>
            <input style={input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{t("next")}</span>
            <input style={input} type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{t("confirm")}</span>
            <input style={input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
            {(ar ? T.strength.ar : T.strength.en)[passwordStrength(next)]}
          </p>
          <button type="submit" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
            {t("change")}
          </button>
        </form>
      )}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 10 }}>
        <strong style={{ fontSize: 14 }}>{t("resetTitle")}</strong>
        <p style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14, lineHeight: 1.7 }}>{t("resetBody")}</p>
        <button type="button" style={{ ...ghost, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={doReset}>
          {busy ? <Loader2 className="spin" size={16} /> : <RotateCcw size={16} />}
          {t("reset")}
        </button>
      </div>

      {msg && (
        <p style={{ margin: 0, fontWeight: 700, color: msg.kind === "ok" ? "#22c55e" : "#ef4444" }}>{msg.text}</p>
      )}
    </div>
  );
}

export default VaultAdminPanel;
