import { useState } from "react";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-context";
import { useFinanceVault } from "@/lib/finance/vault-context";
import { passphraseStrength } from "@/lib/finance/crypto";
import { countVaultRows, totalEncrypted } from "@/lib/finance/vault-admin";
import type { RekeyProgress } from "@/lib/finance/vault-admin";
import { VaultDiagnostics } from "./VaultDiagnostics";

const box: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 16,
  background: "var(--surface-1)",
  display: "grid",
  gap: 12,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--foreground)",
  fontSize: 14,
};

const primary: React.CSSProperties = {
  padding: "10px 15px",
  borderRadius: 10,
  border: "none",
  background: "var(--grad-blue)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  justifySelf: "start",
};

const danger: React.CSSProperties = {
  ...primary,
  background: "transparent",
  color: "#ef4444",
  border: "1px solid rgba(239,68,68,.45)",
};

/** Master-admin controls: change the finance passphrase, or reset the vault. */
export function VaultAdminPanel() {
  const { lang } = useApp();
  const ar = lang === "ar";
  const { status, rekey, reset } = useFinanceVault();

  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RekeyProgress | null>(null);

  const [confirmWord, setConfirmWord] = useState("");
  const [wipe, setWipe] = useState(true);
  const RESET_WORD = ar ? "حذف" : "DELETE";

  async function doRekey() {
    if (newPass.length < 10) return toast.error(ar ? "استخدم 10 أحرف على الأقل." : "Use at least 10 characters.");
    if (newPass !== confirm) return toast.error(ar ? "العبارتان غير متطابقتين." : "Passphrases do not match.");
    setBusy(true);
    try {
      const rows = await rekey(newPass, setProgress);
      setNewPass("");
      setConfirm("");
      toast.success(
        ar ? `تم تغيير العبارة وإعادة تشفير ${rows} سجلاً.` : `Passphrase changed, ${rows} records re-encrypted.`,
      );
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function doReset() {
    if (confirmWord.trim() !== RESET_WORD) {
      return toast.error(ar ? `اكتب «${RESET_WORD}» للتأكيد.` : `Type "${RESET_WORD}" to confirm.`);
    }
    setBusy(true);
    try {
      const counts = await countVaultRows();
      const enc = totalEncrypted(counts);
      if (
        enc > 0 &&
        !window.confirm(
          ar
            ? `يوجد ${enc} سجلاً مشفّراً سيصبح غير قابل للقراءة نهائياً. هل تريد المتابعة؟`
            : `${enc} encrypted records will become permanently unreadable. Continue?`,
        )
      ) {
        return;
      }
      const removed = await reset({ wipeEncrypted: wipe });
      setConfirmWord("");
      toast.success(
        ar
          ? `تمت إعادة تعيين الخزنة${removed ? ` وحذف ${removed} سجلاً مشفّراً` : ""}. أعد تفعيلها بعبارة جديدة.`
          : `Vault reset${removed ? `, ${removed} encrypted records removed` : ""}. Set a new passphrase now.`,
      );
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }} dir={ar ? "rtl" : "ltr"}>
      <VaultDiagnostics />

      {status === "unlocked" && (
        <div style={box}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <KeyRound size={18} />
            <strong>{ar ? "تغيير عبارة المرور المالية" : "Change the finance passphrase"}</strong>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
            {ar
              ? "يعيد المتصفح تشفير كل السجلات بالعبارة الجديدة. لا يُحدَّث مفتاح الخزنة إلا بعد نجاح كل السجلات، فالعبارة القديمة تبقى صالحة لو فشلت العملية."
              : "The browser re-encrypts every record with the new passphrase. The vault key is only replaced after every record succeeds, so the old passphrase keeps working if anything fails."}
          </p>
          <input
            style={input}
            type="password"
            autoComplete="new-password"
            value={newPass}
            placeholder={ar ? "العبارة الجديدة" : "New passphrase"}
            onChange={(e) => setNewPass(e.target.value)}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={{
                  height: 5,
                  flex: 1,
                  borderRadius: 4,
                  background: i < passphraseStrength(newPass) ? "var(--grad-blue)" : "var(--border)",
                }}
              />
            ))}
          </div>
          <input
            style={input}
            type="password"
            autoComplete="new-password"
            value={confirm}
            placeholder={ar ? "تأكيد العبارة الجديدة" : "Confirm new passphrase"}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {progress && (
            <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
              {progress.table} — {progress.done}/{progress.total}
            </span>
          )}
          <button type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void doRekey()}>
            {busy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
            {ar ? "تغيير العبارة وإعادة التشفير" : "Change passphrase & re-encrypt"}
          </button>
        </div>
      )}

      <div style={{ ...box, borderColor: "rgba(239,68,68,.4)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#ef4444" }}>
          <AlertTriangle size={18} />
          <strong>{ar ? "إعادة تعيين الخزنة (تدميرية)" : "Reset the vault (destructive)"}</strong>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
          {ar
            ? "يحذف مفتاح الخزنة نهائياً حتى تستطيع تعيين عبارة جديدة من الصفر. أي سجل مشفّر لن يعود قابلاً للقراءة أبداً — خُذ نسخة احتياطية أولاً."
            : "Permanently deletes the vault key so you can set a fresh passphrase. Any encrypted record becomes unreadable forever — take a backup first."}
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
          <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} style={{ marginTop: 3 }} />
          {ar ? "احذف أيضاً السجلات المشفّرة غير القابلة للقراءة" : "Also delete the unreadable encrypted records"}
        </label>
        <input
          style={input}
          value={confirmWord}
          placeholder={ar ? `اكتب «${RESET_WORD}» للتأكيد` : `Type "${RESET_WORD}" to confirm`}
          onChange={(e) => setConfirmWord(e.target.value)}
        />
        <button
          type="button"
          style={{ ...danger, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={() => void doReset()}
        >
          {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
          {ar ? "إعادة تعيين الخزنة" : "Reset vault"}
        </button>
      </div>
    </div>
  );
}

export default VaultAdminPanel;
