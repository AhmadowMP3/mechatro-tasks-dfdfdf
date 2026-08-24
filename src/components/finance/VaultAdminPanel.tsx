import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
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
  const { status, rekey, reset, setup } = useFinanceVault();

  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RekeyProgress | null>(null);

  const [confirmWord, setConfirmWord] = useState("");
  const [wipe, setWipe] = useState(true);
  const RESET_WORD = ar ? "حذف" : "DELETE";

  // encrypted-record count drives the whole safe/unsafe presentation
  const [encTotal, setEncTotal] = useState<number | null>(null);
  const [countErr, setCountErr] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const loadCounts = useCallback(async () => {
    setCountErr(null);
    try {
      setEncTotal(totalEncrypted(await countVaultRows()));
    } catch (e: any) {
      setEncTotal(null);
      setCountErr(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const safeToReset = encTotal === 0;

  // one-click flow state
  const [oneClickOpen, setOneClickOpen] = useState(false);
  const [ocPass, setOcPass] = useState("");
  const [ocConfirm, setOcConfirm] = useState("");

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

  /** Reset the key and immediately set the new passphrase — safe only with zero encrypted rows. */
  async function doResetAndSetup() {
    if (ocPass.length < 10) return toast.error(ar ? "استخدم 10 أحرف على الأقل." : "Use at least 10 characters.");
    if (ocPass !== ocConfirm) return toast.error(ar ? "العبارتان غير متطابقتين." : "Passphrases do not match.");
    setBusy(true);
    try {
      const fresh = totalEncrypted(await countVaultRows());
      if (fresh > 0) {
        setEncTotal(fresh);
        toast.error(
          ar
            ? `ظهرت ${fresh} سجلات مشفّرة الآن — استخدم الخيارات المتقدّمة بدلاً من ذلك.`
            : `${fresh} encrypted records appeared — use the advanced options instead.`,
        );
        return;
      }
      await reset({ wipeEncrypted: false });
      await setup(ocPass);
      setOcPass("");
      setOcConfirm("");
      setOneClickOpen(false);
      await loadCounts();
      toast.success(ar ? "تم تعيين عبارة المرور المالية الجديدة." : "New finance passphrase set.");
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
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
      await loadCounts();
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
      {/* Plain-language status banner */}
      {encTotal !== null && (
        <div
          style={{
            border: `1px solid ${safeToReset ? "rgba(20,168,110,.45)" : "rgba(245,158,11,.45)"}`,
            background: safeToReset ? "rgba(20,168,110,.10)" : "rgba(245,158,11,.10)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: safeToReset ? "#14A86E" : "#f59e0b" }}>
            {safeToReset ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <strong style={{ fontSize: 15.5, lineHeight: 1.5 }}>
              {safeToReset
                ? ar
                  ? "لا توجد بيانات مالية مشفّرة — إعادة التعيين آمنة تماماً ولن تفقد أي شيء"
                  : "No encrypted finance data — resetting is completely safe, nothing will be lost"
                : ar
                  ? `يوجد ${encTotal} سجلاً مشفّراً — إعادة التعيين ستجعلها غير قابلة للقراءة`
                  : `${encTotal} encrypted records — resetting makes them unreadable`}
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
            {safeToReset
              ? ar
                ? "القفل الحالي موجود لكنه لا يحمي أي سجل. اضغط الزر أدناه لاختيار عبارة مرور مالية جديدة مباشرة."
                : "The current lock exists but protects no record. Use the button below to pick a new finance passphrase directly."
              : ar
                ? "خُذ نسخة احتياطية أولاً، أو افتح الخزنة بعبارتك الحالية وغيّرها بدلاً من إعادة التعيين."
                : "Take a backup first, or unlock with your current passphrase and change it instead of resetting."}
          </p>
          <button
            type="button"
            onClick={() => void loadCounts()}
            style={{
              ...danger,
              color: "var(--muted-foreground)",
              borderColor: "var(--border)",
              padding: "7px 12px",
              fontWeight: 600,
              fontSize: 12.5,
            }}
          >
            <RefreshCw size={14} /> {ar ? "تحديث الفحص" : "Re-check"}
          </button>
        </div>
      )}
      {countErr && (
        <div style={{ ...box, borderColor: "rgba(239,68,68,.4)", color: "#ef4444", fontSize: 13 }}>{countErr}</div>
      )}

      {/* One-click: reset + set new passphrase (only when nothing is encrypted) */}
      {safeToReset && (
        <div style={{ ...box, borderColor: "rgba(20,168,110,.4)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <KeyRound size={18} />
            <strong>{ar ? "إعادة تعيين وتعيين عبارة جديدة" : "Reset & set a new passphrase"}</strong>
          </div>
          {!oneClickOpen ? (
            <button type="button" style={primary} onClick={() => setOneClickOpen(true)}>
              <ShieldCheck size={16} />
              {ar ? "إعادة تعيين وتعيين عبارة جديدة" : "Reset & set a new passphrase"}
            </button>
          ) : (
            <>
              <input
                style={input}
                type="password"
                autoComplete="new-password"
                value={ocPass}
                placeholder={ar ? "عبارة المرور المالية الجديدة" : "New finance passphrase"}
                onChange={(e) => setOcPass(e.target.value)}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    style={{
                      height: 5,
                      flex: 1,
                      borderRadius: 4,
                      background: i < passphraseStrength(ocPass) ? "var(--grad-blue)" : "var(--border)",
                    }}
                  />
                ))}
              </div>
              <input
                style={input}
                type="password"
                autoComplete="new-password"
                value={ocConfirm}
                placeholder={ar ? "تأكيد العبارة الجديدة" : "Confirm new passphrase"}
                onChange={(e) => setOcConfirm(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{ ...primary, opacity: busy ? 0.6 : 1 }}
                  disabled={busy}
                  onClick={() => void doResetAndSetup()}
                >
                  {busy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                  {ar ? "تأكيد" : "Confirm"}
                </button>
                <button
                  type="button"
                  style={{ ...danger, color: "var(--muted-foreground)", borderColor: "var(--border)" }}
                  disabled={busy}
                  onClick={() => {
                    setOneClickOpen(false);
                    setOcPass("");
                    setOcConfirm("");
                  }}
                >
                  {ar ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

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

      {/* Advanced / destructive — collapsed when nothing is encrypted */}
      {safeToReset && !advancedOpen ? (
        <button
          type="button"
          onClick={() => setAdvancedOpen(true)}
          style={{
            justifySelf: "start",
            background: "transparent",
            border: "none",
            color: "var(--muted-foreground)",
            fontSize: 13,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 2px",
          }}
        >
          <ChevronDown size={15} /> {ar ? "خيارات متقدّمة وتشخيص" : "Advanced options & diagnostics"}
        </button>
      ) : (
        <>
          <VaultDiagnostics />
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
            {!safeToReset && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
                <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} style={{ marginTop: 3 }} />
                {ar ? "احذف أيضاً السجلات المشفّرة غير القابلة للقراءة" : "Also delete the unreadable encrypted records"}
              </label>
            )}
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
        </>
      )}
    </div>
  );
}

export default VaultAdminPanel;
