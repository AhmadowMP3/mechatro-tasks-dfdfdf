import { useState } from "react";
import { Lock, ShieldCheck, Loader2, AlertTriangle, LifeBuoy } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useFinanceVault } from "@/lib/finance/vault-context";
import { passwordStrength } from "@/lib/finance/lock";
import { VaultAdminPanel } from "./VaultAdminPanel";

const T = {
  setupTitle: { ar: "تعيين كلمة سر المالية", en: "Set the finance password" },
  setupBody: {
    ar: "اختر كلمة سر واحدة لفتح قسم المالية. ستُطلب مرة واحدة بعد كل تسجيل دخول. البيانات المالية تُحفظ بشكل عادي — كلمة السر هنا للحماية من الدخول فقط.",
    en: "Choose one password to open the finance section. It is asked once per sign-in. Finance data is stored normally — this password only gates access.",
  },
  pass: { ar: "كلمة السر", en: "Password" },
  confirm: { ar: "تأكيد كلمة السر", en: "Confirm password" },
  create: { ar: "تعيين وفتح المالية", en: "Set and open finance" },
  unlockTitle: { ar: "قسم المالية مقفل", en: "Finance is locked" },
  unlockBody: {
    ar: "أدخل كلمة سر المالية لفتح القسم في هذه الجلسة.",
    en: "Enter the finance password to open this section for the current session.",
  },
  unlock: { ar: "فتح", en: "Unlock" },
  wrong: { ar: "كلمة السر غير صحيحة.", en: "Incorrect password." },
  mismatch: { ar: "كلمتا السر غير متطابقتين.", en: "Passwords do not match." },
  weak: { ar: "استخدم 8 أحرف على الأقل.", en: "Use at least 8 characters." },
  help: { ar: "كلمة السر غير مقبولة؟", en: "Password not accepted?" },
  strength: {
    ar: ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"],
    en: ["Very weak", "Weak", "Fair", "Good", "Strong"],
  },
};

const card: React.CSSProperties = {
  maxWidth: 520,
  margin: "60px auto",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 18,
  padding: 28,
  display: "grid",
  gap: 16,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 11,
  border: "1px solid var(--border)",
  background: "var(--surface-1)",
  color: "var(--foreground)",
  fontSize: 15,
};

const button: React.CSSProperties = {
  padding: "11px 16px",
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

export function FinanceLockGate({ children }: { children: React.ReactNode }) {
  const { lang } = useApp();
  const ar = lang === "ar";
  const t = <K extends keyof typeof T>(k: K) => (ar ? T[k].ar : T[k].en) as string;
  const { status, setup, unlock, error } = useFinanceVault();

  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  if (status === "loading") {
    return (
      <div style={{ ...card, textAlign: "center" }}>
        <Loader2 className="spin" size={26} style={{ margin: "0 auto" }} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ ...card, borderColor: "#ef4444" }}>
        <AlertTriangle size={22} color="#ef4444" />
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (status === "unlocked") return <>{children}</>;

  const isSetup = status === "not_set";
  const strength = passwordStrength(pass);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (isSetup) {
        if (pass.length < 8) return setMsg(t("weak"));
        if (pass !== confirm) return setMsg(t("mismatch"));
        await setup(pass);
      } else {
        const ok = await unlock(pass);
        if (!ok) return setMsg(t("wrong"));
      }
      setPass("");
      setConfirm("");
    } catch (err: any) {
      setMsg(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={ar ? "rtl" : "ltr"}>
      <form onSubmit={submit} style={card}>
        <h2 style={{ margin: 0, display: "flex", gap: 10, alignItems: "center", fontSize: 20 }}>
          {isSetup ? <ShieldCheck size={22} /> : <Lock size={22} />}
          {isSetup ? t("setupTitle") : t("unlockTitle")}
        </h2>
        <p style={{ margin: 0, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
          {isSetup ? t("setupBody") : t("unlockBody")}
        </p>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{t("pass")}</span>
          <input
            style={input}
            type="password"
            autoComplete={isSetup ? "new-password" : "current-password"}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>

        {isSetup && (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t("confirm")}</span>
              <input
                style={input}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
              {(ar ? T.strength.ar : T.strength.en)[strength]}
            </p>
          </>
        )}

        {msg && <p style={{ margin: 0, color: "#ef4444", fontWeight: 700 }}>{msg}</p>}

        <button type="submit" style={{ ...button, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : isSetup ? <ShieldCheck size={17} /> : <Lock size={17} />}
          {isSetup ? t("create") : t("unlock")}
        </button>

        {!isSetup && (
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
            }}
          >
            <LifeBuoy size={16} />
            {t("help")}
          </button>
        )}
      </form>

      {showHelp && !isSetup && (
        <div style={{ maxWidth: 640, margin: "0 auto 60px" }}>
          <VaultAdminPanel />
        </div>
      )}
    </div>
  );
}

export default FinanceLockGate;
