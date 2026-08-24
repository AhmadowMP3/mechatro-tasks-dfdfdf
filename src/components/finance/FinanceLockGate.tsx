import { useState } from "react";
import { Lock, ShieldCheck, KeyRound, Loader2, AlertTriangle, LifeBuoy } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useFinanceVault } from "@/lib/finance/vault-context";
import { passphraseStrength } from "@/lib/finance/crypto";
import { runVaultMigration, type MigrationProgress } from "@/lib/finance/migrate";
import { VaultDiagnostics } from "./VaultDiagnostics";


const T = {
  setupTitle: { ar: "تفعيل خزنة المالية المشفّرة", en: "Set up the encrypted finance vault" },
  setupBody: {
    ar: "اختر عبارة مرور مالية واحدة. كل البيانات المالية ستُشفَّر داخل متصفحك قبل حفظها، ولا يمكن لأي شخص — بما فيهم مدير النظام أو قاعدة البيانات — قراءتها بدون هذه العبارة.",
    en: "Choose one shared finance passphrase. All finance data is encrypted in your browser before it is saved — nobody, including the database or an administrator, can read it without this passphrase.",
  },
  warn: {
    ar: "لا توجد طريقة لاستعادة العبارة. إذا فُقدت، تُفقد كل البيانات المالية نهائياً.",
    en: "There is no recovery. If the passphrase is lost, all finance data is permanently unreadable.",
  },
  pass: { ar: "عبارة المرور", en: "Passphrase" },
  confirm: { ar: "تأكيد العبارة", en: "Confirm passphrase" },
  ack: {
    ar: "أفهم أنه لا يمكن استعادة البيانات إذا نسيت العبارة.",
    en: "I understand the data cannot be recovered if I forget this passphrase.",
  },
  create: { ar: "تفعيل الخزنة", en: "Create vault" },
  unlockTitle: { ar: "الخزنة المالية مقفلة", en: "Finance vault is locked" },
  unlockBody: {
    ar: "أدخل عبارة المرور المالية لفك تشفير البيانات في هذا المتصفح.",
    en: "Enter the finance passphrase to decrypt the data in this browser.",
  },
  unlock: { ar: "فتح", en: "Unlock" },
  wrong: { ar: "عبارة المرور غير صحيحة.", en: "Incorrect passphrase." },
  mismatch: { ar: "العبارتان غير متطابقتين.", en: "Passphrases do not match." },
  weak: { ar: "استخدم 10 أحرف على الأقل.", en: "Use at least 10 characters." },
  encrypting: { ar: "جارٍ تشفير السجلات الحالية…", en: "Encrypting existing records…" },
  strength: { ar: ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"], en: ["Very weak", "Weak", "Fair", "Good", "Strong"] },
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
  const { status, migrated, setup, unlock, markMigrated, error } = useFinanceVault();

  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
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
      <div style={{ ...card, borderColor: "var(--danger, #ef4444)" }}>
        <AlertTriangle size={22} color="#ef4444" />
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (status === "unlocked") {
    if (!migrated) {
      // Encrypt legacy plaintext rows once, right after the vault is opened.
      if (!busy) {
        setBusy(true);
        void runVaultMigration(setProgress)
          .then(() => markMigrated())
          .catch((e) => setMsg(String(e?.message ?? e)))
          .finally(() => setBusy(false));
      }
      return (
        <div style={card}>
          <h2 style={{ margin: 0, display: "flex", gap: 10, alignItems: "center" }}>
            <ShieldCheck size={22} /> {t("encrypting")}
          </h2>
          {progress && (
            <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
              {progress.table} — {progress.done}/{progress.total}
            </p>
          )}
          {msg && <p style={{ color: "#ef4444", margin: 0 }}>{msg}</p>}
          <Loader2 className="spin" size={22} />
        </div>
      );
    }
    return <>{children}</>;
  }

  const isSetup = status === "not_set";
  const strength = passphraseStrength(pass);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (isSetup) {
        if (pass.length < 10) return setMsg(t("weak"));
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
    <form onSubmit={submit} style={card} dir={ar ? "rtl" : "ltr"}>
      <h2 style={{ margin: 0, display: "flex", gap: 10, alignItems: "center", fontSize: 20 }}>
        {isSetup ? <ShieldCheck size={22} /> : <Lock size={22} />}
        {isSetup ? t("setupTitle") : t("unlockTitle")}
      </h2>
      <p style={{ margin: 0, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
        {isSetup ? t("setupBody") : t("unlockBody")}
      </p>

      {isSetup && (
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: 12,
            borderRadius: 12,
            background: "rgba(239,68,68,.08)",
            border: "1px solid rgba(239,68,68,.35)",
          }}
        >
          <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>{t("warn")}</span>
        </div>
      )}

      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
        {t("pass")}
        <input
          style={input}
          type="password"
          value={pass}
          autoFocus
          autoComplete={isSetup ? "new-password" : "current-password"}
          onChange={(e) => setPass(e.target.value)}
        />
      </label>

      {isSetup && (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={{
                  height: 5,
                  flex: 1,
                  borderRadius: 4,
                  background: i < strength ? "var(--grad-blue)" : "var(--border)",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: -8 }}>
            {(ar ? T.strength.ar : T.strength.en)[strength]}
          </span>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            {t("confirm")}
            <input
              style={input}
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
            {t("ack")}
          </label>
        </>
      )}

      {msg && <p style={{ color: "#ef4444", margin: 0, fontSize: 13.5 }}>{msg}</p>}

      <button type="submit" style={{ ...button, opacity: busy || (isSetup && !ack) ? 0.6 : 1 }} disabled={busy || (isSetup && !ack)}>
        {busy ? <Loader2 size={17} className="spin" /> : <KeyRound size={17} />}
        {isSetup ? t("create") : t("unlock")}
      </button>
    </form>
  );
}

export default FinanceLockGate;
