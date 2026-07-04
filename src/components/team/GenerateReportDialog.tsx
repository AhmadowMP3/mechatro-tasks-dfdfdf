import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Loader2, RefreshCw, X, Check } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/routes/_authenticated/projects";
import { useApp, type Profile } from "@/lib/app-context";
import { loadMemberReportData, type ReportRange } from "@/lib/report/data";
import {
  buildMemberReportPdf,
  persistMemberReportPdf,
  type PreparedMemberReport,
  type ReportLangChoice,
} from "@/lib/report/generator";
import type { ThemeId } from "@/lib/report/themes";

type RangeKey = "all" | "7d" | "30d" | "90d" | "custom";

export function GenerateReportDialog({ member, onClose }: { member: Profile; onClose: () => void }) {
  const { t, lang } = useApp();
  const [langChoice, setLangChoice] = useState<ReportLangChoice>("bilingual");
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [theme, setTheme] = useState<ThemeId>("aurora");
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedMemberReport | null>(null);
  const [confirming, setConfirming] = useState(false);

  const build = async () => {
    setBusy(true);
    try {
      const range: ReportRange =
        rangeKey === "custom" ? { kind: "custom", from, to } :
        rangeKey === "all" ? { kind: "all" } :
        { kind: rangeKey };
      const data = await loadMemberReportData(member.id, range);
      const p = await buildMemberReportPdf(data, langChoice, theme);
      setPrepared(p);

    } catch (e: unknown) {
      console.error(e);
      toast.error((e as Error).message || t("reportError"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!prepared) return;
    setConfirming(true);
    try {
      await persistMemberReportPdf(prepared);
      toast.success(t("reportGenerated"));
      onClose();
    } catch (e: unknown) {
      console.error(e);
      toast.error((e as Error).message || t("reportError"));
    } finally {
      setConfirming(false);
    }
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600,
    border: `1px solid ${active ? "var(--brand-blue)" : "var(--border)"}`,
    background: active ? "var(--grad-blue)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--foreground)",
    minHeight: 40, display: "inline-flex", alignItems: "center", gap: 6,
  });

  if (prepared) {
    return (
      <PreviewModal
        prepared={prepared}
        confirming={confirming}
        onConfirm={confirm}
        onRegenerate={() => setPrepared(null)}
        onClose={onClose}
      />
    );
  }

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
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

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("chooseStyle")}</div>
        <div className="wizard-theme-grid">
          {([
            { id: "aurora" as const, label: t("themeAurora"), bg: "linear-gradient(135deg,var(--sidebar),#0E4A6B)", fg: "var(--foreground)" },
            { id: "executive" as const, label: t("themeExecutive"), bg: "linear-gradient(135deg,#0A2540,#132D50)", fg: "#fff" },
            { id: "minimal" as const, label: t("themeMinimal"), bg: "#FCFCFC", fg: "#111" },
          ]).map((c) => (
            <button key={c.id} type="button" onClick={() => setTheme(c.id)} className="brand-btn" style={{
              flexDirection: "column", padding: 0, overflow: "hidden", gap: 0, minHeight: 100,
              background: "var(--surface-2)", border: `2px solid ${theme === c.id ? "#42C2EE" : "var(--border)"}`,
              color: "var(--foreground)",
            }}>
              <div style={{ background: c.bg, color: c.fg, width: "100%", height: 56, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, letterSpacing: 2, position: "relative" }}>
                REPORT
                {theme === c.id && <div style={{ position: "absolute", top: 4, insetInlineEnd: 4, width: 20, height: 20, borderRadius: 999, background: "#42C2EE", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={12} /></div>}
              </div>
              <div style={{ padding: 8, fontSize: 12, fontWeight: 700 }}>{c.label}</div>
            </button>
          ))}
        </div>
      </div>


      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={build} disabled={busy} className="brand-btn"
          style={{ background: "var(--grad-blue)", color: "#fff", flex: 1, opacity: busy ? 0.7 : 1 }}>
          {busy ? <><Loader2 size={16} className="spin" /> {t("buildingPdf")}</> : <><Eye size={16} /> {t("previewPdf")}</>}
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

function PreviewModal({
  prepared, confirming, onConfirm, onRegenerate, onClose,
}: {
  prepared: PreparedMemberReport;
  confirming: boolean;
  onConfirm: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const { t } = useApp();
  const previewUrl = useMemo(() => URL.createObjectURL(prepared.blob), [prepared.blob]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  const sizeKb = Math.max(1, Math.round(prepared.blob.size / 1024));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(4,10,22,0.72)", backdropFilter: "blur(6px)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 100%)", height: "min(92vh, 900px)", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "var(--grad-blue)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}>
            <Eye size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--foreground)" }}>{t("reportPreview")}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {prepared.filename} · {t("pageCountLabel")}: {prepared.pageCount} · {sizeKb} KB
            </div>
          </div>
          <button onClick={onClose} className="brand-btn"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)", padding: 8 }}
            aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, background: "#1a1f2e", position: "relative" }}>
          <iframe
            src={previewUrl}
            title={t("reportPreview")}
            style={{ width: "100%", height: "100%", border: 0, background: "#ffffff" }}
          />
        </div>

        <div style={{
          padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap",
          background: "var(--surface-2)",
        }}>
          <button onClick={onRegenerate} disabled={confirming} className="brand-btn"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
            <RefreshCw size={16} /> {t("regenerate")}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={confirming} className="brand-btn"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
            {t("cancel")}
          </button>
          <button onClick={onConfirm} disabled={confirming} className="brand-btn"
            style={{ background: "var(--grad-blue)", color: "#fff", opacity: confirming ? 0.7 : 1 }}>
            {confirming ? <><Loader2 size={16} className="spin" /> {t("buildingPdf")}</> : <><Download size={16} /> {t("confirmDownload")}</>}
          </button>
        </div>
        <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}

