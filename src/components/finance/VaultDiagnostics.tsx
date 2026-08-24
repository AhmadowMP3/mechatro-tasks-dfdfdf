import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useFinanceVault } from "@/lib/finance/vault-context";
import { countVaultRows, totalEncrypted, type TableCounts } from "@/lib/finance/vault-admin";

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

const btn: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--foreground)",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

/**
 * Read-only vault diagnostics plus a "try my passphrase" recovery helper.
 * Nothing here changes finance data.
 */
export function VaultDiagnostics({ compact = false }: { compact?: boolean }) {
  const { lang } = useApp();
  const ar = lang === "ar";
  const { meta, status, recover } = useFinanceVault();
  const [counts, setCounts] = useState<TableCounts[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setCounts(await countVaultRows());
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const encTotal = counts ? totalEncrypted(counts) : null;

  async function tryRecover() {
    setBusy(true);
    setResult(null);
    setErr(null);
    try {
      const hit = await recover(pass);
      if (!hit) {
        setErr(ar ? "لم تنجح أي صيغة من العبارة المُدخلة." : "None of the passphrase variants worked.");
      } else {
        setResult(
          (ar ? "نجحت الصيغة: " : "Working variant: ") + (ar ? hit.ar : hit.en),
        );
        setPass("");
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={box} dir={ar ? "rtl" : "ltr"}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ShieldCheck size={18} />
        <strong>{ar ? "تشخيص الخزنة المشفّرة" : "Encrypted vault diagnostics"}</strong>
        <button type="button" style={{ ...btn, marginInlineStart: "auto" }} onClick={() => void load()} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          {ar ? "تحديث" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 6, fontSize: 13.5, color: "var(--muted-foreground)" }}>
        <span>
          {ar ? "حالة الخزنة" : "Vault state"}: <strong style={{ color: "var(--foreground)" }}>{status}</strong>
        </span>
        <span>
          {ar ? "سجل المفتاح موجود" : "Key record exists"}:{" "}
          <strong style={{ color: "var(--foreground)" }}>{meta ? (ar ? "نعم" : "Yes") : ar ? "لا" : "No"}</strong>
        </span>
        {meta && (
          <>
            <span>
              {ar ? "تكرارات الاشتقاق" : "KDF iterations"}:{" "}
              <strong style={{ color: "var(--foreground)" }}>{meta.kdf_iterations}</strong>
            </span>
            <span>
              {ar ? "طول الملح / التحقق" : "Salt / verifier length"}:{" "}
              <strong style={{ color: "var(--foreground)" }}>
                {meta.kdf_salt?.length ?? 0} / {meta.verifier?.length ?? 0}
              </strong>
            </span>
            {meta.updated_at && (
              <span>
                {ar ? "آخر تحديث للمفتاح" : "Key last updated"}:{" "}
                <strong style={{ color: "var(--foreground)" }}>
                  {new Date(meta.updated_at).toLocaleString(ar ? "ar" : "en")}
                </strong>
              </span>
            )}
          </>
        )}
        <span>
          {ar ? "إجمالي السجلات المشفّرة" : "Encrypted records"}:{" "}
          <strong style={{ color: encTotal ? "#f59e0b" : "#14A86E" }}>{encTotal ?? "…"}</strong>
        </span>
      </div>

      {counts && !compact && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: ar ? "right" : "left", color: "var(--muted-foreground)" }}>
                <th style={{ padding: "6px 8px" }}>{ar ? "الجدول" : "Table"}</th>
                <th style={{ padding: "6px 8px" }}>{ar ? "الكل" : "Total"}</th>
                <th style={{ padding: "6px 8px" }}>{ar ? "مشفّر" : "Encrypted"}</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.table} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px" }}>{c.table}</td>
                  <td style={{ padding: "6px 8px" }}>{c.total}</td>
                  <td style={{ padding: "6px 8px", color: c.encrypted ? "#f59e0b" : "var(--muted-foreground)" }}>
                    {c.encrypted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status !== "unlocked" && meta && (
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {ar ? "اختبار العبارة بعدة صيغ" : "Test the passphrase in several forms"}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            {ar
              ? "يجرّب المتصفح العبارة كما كُتبت، وبدون المسافات، وبتطبيعات Unicode، وبالأرقام اللاتينية — وإن فشل التحقق يجرّب فتح سجل مشفّر حقيقي."
              : "The browser tries it as typed, trimmed, Unicode-normalised and with Latin digits — and if the verifier fails, against a real encrypted record."}
          </span>
          <input
            style={input}
            type="password"
            value={pass}
            autoComplete="off"
            placeholder={ar ? "العبارة التي تكتبها عادة" : "The passphrase you normally type"}
            onChange={(e) => setPass(e.target.value)}
          />
          <button type="button" style={btn} onClick={() => void tryRecover()} disabled={busy || !pass}>
            {busy ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}
            {ar ? "جرّب الفتح" : "Try to unlock"}
          </button>
        </div>
      )}

      {result && (
        <p style={{ margin: 0, color: "#14A86E", fontSize: 13.5, display: "flex", gap: 6 }}>
          <ShieldCheck size={16} /> {result}
        </p>
      )}
      {err && (
        <p style={{ margin: 0, color: "#ef4444", fontSize: 13.5, display: "flex", gap: 6 }}>
          <AlertTriangle size={16} /> {err}
        </p>
      )}
    </div>
  );
}

export default VaultDiagnostics;
