import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/routes/_authenticated/projects";
import { useApp, type Profile } from "@/lib/app-context";
import { loadMemberReportData, type ReportRange } from "@/lib/report/data";
import { generateMemberReportPdf, type ReportLangChoice } from "@/lib/report/generator";

type RangeKey = "all" | "7d" | "30d" | "90d" | "custom";

export function GenerateReportDialog({ member, onClose }: { member: Profile; onClose: () => void }) {
  const { t } = useApp();
  const [langChoice, setLangChoice] = useState<ReportLangChoice>("bilingual");
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  const build = async () => {
    setBusy(true);
    try {
      const range: ReportRange =
        rangeKey === "custom" ? { kind: "custom", from, to } :
        rangeKey === "all" ? { kind: "all" } :
        { kind: rangeKey };
      const data = await loadMemberReportData(member.id, range);
      await generateMemberReportPdf(data, langChoice);
      toast.success(t("reportGenerated"));
      onClose();
    } catch (e: unknown) {
      console.error(e);
      toast.error((e as Error).message || t("reportError"));
    } finally {
      setBusy(false);
    }
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600,
    border: `1px solid ${active ? "var(--brand-blue)" : "var(--border)"}`,
    background: active ? "var(--grad-blue)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--foreground)",
    minHeight: 40, display: "inline-flex", alignItems: "center", gap: 6,
  });

  return (
    <ModalShell title={`${t("generateReport")} · ${member.full_name}`} onClose={onClose}>
      <div style={{
        background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12,
        padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "center",
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--grad-blue)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <FileText size={22} />
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          {t("memberReport")} — cover + performance + charts + tasks + sessions + activity.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("reportLanguage")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["bilingual", "ar", "en"] as ReportLangChoice[]).map((k) => (
            <button key={k} onClick={() => setLangChoice(k)} style={chipStyle(langChoice === k)}>
              {k === "bilingual" ? t("bilingual") : k === "ar" ? t("arabicOnly") : t("englishOnly")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("reportRange")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["7d", "30d", "90d", "all", "custom"] as RangeKey[]).map((k) => (
            <button key={k} onClick={() => setRangeKey(k)} style={chipStyle(rangeKey === k)}>
              {k === "7d" ? t("rangeLast7d") : k === "30d" ? t("rangeLast30d") : k === "90d" ? t("rangeLast90d") : k === "all" ? t("rangeAll") : t("rangeCustom")}
            </button>
          ))}
        </div>
        {rangeKey === "custom" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("fromDate")}
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                style={{ width: "100%", padding: 10, marginTop: 4, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("toDate")}
              <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
                style={{ width: "100%", padding: 10, marginTop: 4, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
            </label>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={build} disabled={busy} className="brand-btn"
          style={{ background: "var(--grad-blue)", color: "#fff", flex: 1, opacity: busy ? 0.7 : 1 }}>
          {busy ? <><Loader2 size={16} className="spin" /> {t("buildingPdf")}</> : <><FileText size={16} /> {t("buildPdf")}</>}
        </button>
        <button onClick={onClose} disabled={busy} className="brand-btn"
          style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
          {t("cancel")}
        </button>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </ModalShell>
  );
}
