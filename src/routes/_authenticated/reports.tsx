import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Download, Loader2, ArrowRight, ArrowLeft, Users2, User, Eye, Palette, Check, History } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/Avatar";
import { exportBrandedWorkbook } from "@/lib/export/xlsx-workbook";
import { THEMES, type ThemeId } from "@/lib/report/themes";
import { loadMemberReportData, type ReportRange } from "@/lib/report/data";
import { buildMemberReportPdf, buildTeamReportPdf, persistMemberReportPdf, type PreparedMemberReport, type ReportLangChoice } from "@/lib/report/generator";
import { buildTeamReportHtml, loadTeamReportData } from "@/lib/report/team-report";
import type { Lang } from "@/i18n/dict";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Scope = "team" | "member";
type WizardStep = 1 | 2 | 3 | 4 | 5;

function ReportsPage() {
  const { t, isAdmin, lang, user } = useApp();
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState<"en" | "ar" | null>(null);

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
        {t("adminsOnly")}
      </div>
    );
  }

  const downloadExcel = async (targetLang: Lang) => {
    setBusy(targetLang === "ar" ? "ar" : "en");
    try {
      await exportBrandedWorkbook({
        lang: targetLang,
        generatedBy: user?.full_name ?? t("admin"),
      });
      toast.success(t("workbookDownloaded"));
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title={t("reportsHub")}
        subtitle={t("reportsHubDesc")}
        actions={
          <Link
            to="/reports-history"
            className="brand-btn"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          >
            <History size={16} /> {t("reportsHistoryLink")}
          </Link>
        }
      />


      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, padding: "0 20px 20px" }}>
        {/* Excel card */}
        <div className="brand-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#166534,#22C55E)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              <FileSpreadsheet size={26} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>{t("excelWorkbook")}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{t("excelWorkbookDesc")}</div>
            </div>
          </div>

          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--muted)" }}>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {t("excelSummaryKpis")}</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {t("excelAllTasksFilters")}</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {t("excelOneSheetPerMember")}</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {t("excelColorPills")}</li>
          </ul>

          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <button onClick={() => downloadExcel("en")} disabled={!!busy} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", flex: 1, opacity: busy ? 0.7 : 1 }}>
              {busy === "en" ? <><Loader2 size={16} className="spin" /> ...</> : <><Download size={16} /> {t("downloadExcelEN")}</>}
            </button>
            <button onClick={() => downloadExcel("ar")} disabled={!!busy} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", flex: 1, opacity: busy ? 0.7 : 1 }}>
              {busy === "ar" ? <><Loader2 size={16} className="spin" /> ...</> : <><Download size={16} /> {t("downloadExcelAR")}</>}
            </button>
          </div>
        </div>

        {/* PDF card */}
        <div className="brand-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#7c2d12,#F0676A)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              <FileText size={26} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>{t("pdfReports")}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{t("pdfReportsDesc")}</div>
            </div>
          </div>

          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--muted)" }}>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {lang === "ar" ? "الفريق كاملاً أو عضو محدد" : "Whole team or single member"}</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {lang === "ar" ? "3 أنماط مصممة بعناية" : "3 crafted themes"}</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {lang === "ar" ? "معاينة قبل التحميل" : "Preview before download"}</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={14} style={{ color: "#22C55E" }} /> {lang === "ar" ? "عربي وإنجليزي وثنائي اللغة" : "AR / EN / bilingual"}</li>
          </ul>

          <button onClick={() => setWizardOpen(true)} className="brand-btn" style={{ background: "linear-gradient(135deg,#7C5CD1,#42C2EE)", color: "#fff", marginTop: "auto" }}>
            <FileText size={16} /> {t("newPdfReport")}
          </button>
        </div>
      </div>

      {wizardOpen && <PdfWizard onClose={() => setWizardOpen(false)} />}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ============================ WIZARD ============================
function PdfWizard({ onClose }: { onClose: () => void }) {
  const { t, lang, users, user } = useApp();
  const [step, setStep] = useState<WizardStep>(1);
  const [scope, setScope] = useState<Scope>("team");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [langChoice, setLangChoice] = useState<ReportLangChoice>("bilingual");
  const [rangeKey, setRangeKey] = useState<"7d" | "30d" | "90d" | "all" | "custom">("30d");
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [theme, setTheme] = useState<ThemeId>("aurora");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ blob: Blob; filename: string; pageCount: number; kind: "team" | "member"; memberReport?: PreparedMemberReport } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const canProceed = useMemo(() => {
    if (step === 1) return scope === "team" || (scope === "member" && !!memberId);
    return true;
  }, [step, scope, memberId]);

  const buildRange = (): ReportRange =>
    rangeKey === "custom" ? { kind: "custom", from, to } :
    rangeKey === "all" ? { kind: "all" } :
    { kind: rangeKey };

  const build = async () => {
    setBusy(true);
    try {
      if (scope === "team") {
        const r = buildRange();
        const range = {
          from: r.kind === "custom" ? new Date(r.from) : (r.kind === "all" ? null : new Date(Date.now() - (r.kind === "7d" ? 7 : r.kind === "30d" ? 30 : 90) * 864e5)),
          to: r.kind === "custom" ? new Date(r.to + "T23:59:59") : null,
          label: r.kind,
        };
        const data = await loadTeamReportData(range, user?.full_name ?? "Admin");
        const html = langChoice === "bilingual"
          ? buildTeamReportHtml(data, "ar", theme) + `<div class="html2pdf__page-break"></div>` + buildTeamReportHtml(data, "en", theme)
          : buildTeamReportHtml(data, langChoice as Lang, theme);
        const filename = `Mechatro_Team_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
        const result = await buildTeamReportPdf(html, filename);
        setPrepared({ ...result, kind: "team" });
      } else if (memberId) {
        const data = await loadMemberReportData(memberId, buildRange());
        const p = await buildMemberReportPdf(data, langChoice, theme);
        setPrepared({ blob: p.blob, filename: p.filename, pageCount: p.pageCount, kind: "member", memberReport: p });
      }
      setStep(5);
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || t("reportError"));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!prepared) return;
    setConfirming(true);
    try {
      if (prepared.kind === "member" && prepared.memberReport) {
        await persistMemberReportPdf(prepared.memberReport);
      } else {
        const url = URL.createObjectURL(prepared.blob);
        const a = document.createElement("a"); a.href = url; a.download = prepared.filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast.success(t("reportGenerated"));
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,10,22,0.72)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(920px,100%)", maxHeight: "94vh", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}>
        {/* Header with step indicator */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>{t("newPdfReport")}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("step")} {step} {t("ofSteps")} 5</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? "linear-gradient(90deg,#42C2EE,#7C5CD1)" : "var(--border)" }} />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {step === 1 && <StepScope scope={scope} setScope={setScope} memberId={memberId} setMemberId={setMemberId} users={users} />}
          {step === 2 && <StepLanguage value={langChoice} onChange={setLangChoice} />}
          {step === 3 && <StepPeriod rangeKey={rangeKey} setRangeKey={setRangeKey} from={from} to={to} setFrom={setFrom} setTo={setTo} today={today} />}
          {step === 4 && <StepTheme value={theme} onChange={setTheme} />}
          {step === 5 && prepared && <StepPreview prepared={prepared} />}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}>{t("cancel")}</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && step < 5 && (
              <button onClick={() => setStep((s) => (s - 1) as WizardStep)} className="brand-btn" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                <ArrowLeft size={16} /> {t("back")}
              </button>
            )}
            {step < 4 && (
              <button disabled={!canProceed} onClick={() => setStep((s) => (s + 1) as WizardStep)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", opacity: canProceed ? 1 : 0.5 }}>
                {t("next")} <ArrowRight size={16} />
              </button>
            )}
            {step === 4 && (
              <button disabled={busy} onClick={build} className="brand-btn" style={{ background: "linear-gradient(135deg,#7C5CD1,#42C2EE)", color: "#fff", opacity: busy ? 0.7 : 1 }}>
                {busy ? <><Loader2 size={16} className="spin" /> {t("buildingPreview")}</> : <><Eye size={16} /> {t("buildPreview")}</>}
              </button>
            )}
            {step === 5 && (
              <button disabled={confirming} onClick={download} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", opacity: confirming ? 0.7 : 1 }}>
                {confirming ? <><Loader2 size={16} className="spin" /> ...</> : <><Download size={16} /> {t("confirmDownload")}</>}
              </button>
            )}
          </div>
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ---------- Steps ----------
function StepScope({ scope, setScope, memberId, setMemberId, users }: { scope: Scope; setScope: (s: Scope) => void; memberId: string | null; setMemberId: (id: string | null) => void; users: Array<{ id: string; full_name: string; role: string; avatar_url: string | null; active: boolean }> }) {
  const { t, lang } = useApp();
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("reportScope")}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{lang === "ar" ? "اختر إن كان التقرير للفريق كاملاً أو لعضو محدد" : "Pick whether to report on the whole team or a specific member"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <ScopeCard active={scope === "team"} onClick={() => setScope("team")} icon={<Users2 size={22} />} title={t("scopeTeam")} desc={t("scopeTeamDesc")} />
        <ScopeCard active={scope === "member"} onClick={() => setScope("member")} icon={<User size={22} />} title={t("scopeMember")} desc={t("scopeMemberDesc")} />
      </div>
      {scope === "member" && (
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>{t("pickMember")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {users.filter((u) => u.active).map((u) => (
              <button key={u.id} onClick={() => setMemberId(u.id)} className="brand-btn" style={{
                justifyContent: "flex-start", padding: 10, gap: 10,
                background: memberId === u.id ? "var(--grad-blue)" : "var(--surface-2)",
                color: memberId === u.id ? "#fff" : "var(--foreground)",
                border: `1px solid ${memberId === u.id ? "transparent" : "var(--border)"}`,
              }}>
                <Avatar id={u.id} name={u.full_name} size={28} />
                <div style={{ textAlign: lang === "ar" ? "right" : "left", overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.full_name}</div>
                  <div style={{ fontSize: 10, opacity: 0.75 }}>{u.role}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScopeCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button onClick={onClick} className="brand-btn" style={{
      display: "flex", flexDirection: "column", alignItems: "flex-start", padding: 20, gap: 8,
      background: active ? "var(--grad-blue)" : "var(--surface-2)",
      color: active ? "#fff" : "var(--foreground)",
      border: `1px solid ${active ? "transparent" : "var(--border)"}`,
      minHeight: 120,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: active ? "rgba(255,255,255,.2)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 11.5, opacity: 0.75 }}>{desc}</div>
    </button>
  );
}

function StepLanguage({ value, onChange }: { value: ReportLangChoice; onChange: (v: ReportLangChoice) => void }) {
  const { t, lang } = useApp();
  const opts: Array<{ id: ReportLangChoice; label: string; desc: string }> = [
    { id: "bilingual", label: lang === "ar" ? "ثنائي اللغة" : "Bilingual", desc: lang === "ar" ? "عربي + إنجليزي معاً" : "AR + EN together" },
    { id: "ar", label: lang === "ar" ? "عربي فقط" : "Arabic only", desc: "العربية" },
    { id: "en", label: lang === "ar" ? "إنجليزي فقط" : "English only", desc: "English" },
  ];
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("reportLanguage")}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{lang === "ar" ? "لغة التقرير" : "Report language"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {opts.map((o) => (
          <button key={o.id} onClick={() => onChange(o.id)} className="brand-btn" style={{
            flexDirection: "column", padding: 20, gap: 6, minHeight: 96,
            background: value === o.id ? "var(--grad-blue)" : "var(--surface-2)",
            color: value === o.id ? "#fff" : "var(--foreground)",
            border: `1px solid ${value === o.id ? "transparent" : "var(--border)"}`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{o.label}</div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>{o.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepPeriod({ rangeKey, setRangeKey, from, to, setFrom, setTo, today }: { rangeKey: "7d"|"30d"|"90d"|"all"|"custom"; setRangeKey: (k: "7d"|"30d"|"90d"|"all"|"custom") => void; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; today: string }) {
  const { t, lang } = useApp();
  const opts: Array<{ id: "7d"|"30d"|"90d"|"all"|"custom"; label: string }> = [
    { id: "7d", label: t("rangeLast7d") },
    { id: "30d", label: t("rangeLast30d") },
    { id: "90d", label: t("rangeLast90d") },
    { id: "all", label: t("rangeAll") },
    { id: "custom", label: t("rangeCustom") },
  ];
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("reportRange")}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{lang === "ar" ? "الفترة الزمنية للتقرير" : "Time period"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {opts.map((o) => (
          <button key={o.id} onClick={() => setRangeKey(o.id)} className="brand-btn" style={{
            background: rangeKey === o.id ? "var(--grad-blue)" : "var(--surface-2)",
            color: rangeKey === o.id ? "#fff" : "var(--foreground)",
            border: `1px solid ${rangeKey === o.id ? "transparent" : "var(--border)"}`,
          }}>{o.label}</button>
        ))}
      </div>
      {rangeKey === "custom" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("fromDate")}
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 4, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("toDate")}
            <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 4, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
          </label>
        </div>
      )}
    </div>
  );
}

function StepTheme({ value, onChange }: { value: ThemeId; onChange: (v: ThemeId) => void }) {
  const { t, lang } = useApp();
  const cards: Array<{ id: ThemeId; label: string; desc: string; preview: React.CSSProperties }> = [
    { id: "aurora", label: t("themeAurora"), desc: t("themeAuroraDesc"), preview: { background: "linear-gradient(135deg,#050D17 0%,#0B2540 45%,#0E4A6B 100%)", color: "#EAF2F9" } },
    { id: "executive", label: t("themeExecutive"), desc: t("themeExecutiveDesc"), preview: { background: "linear-gradient(135deg,#0A2540 0%,#132D50 50%,#0A2540 100%)", color: "#fff" } },
    { id: "minimal", label: t("themeMinimal"), desc: t("themeMinimalDesc"), preview: { background: "#FCFCFC", color: "#111" } },
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Palette size={18} /> <div style={{ fontSize: 15, fontWeight: 700 }}>{t("chooseStyle")}</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{lang === "ar" ? "اختر النمط البصري للتقرير" : "Pick the visual style"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {cards.map((c) => (
          <button key={c.id} onClick={() => onChange(c.id)} className="brand-btn" style={{
            flexDirection: "column", padding: 0, overflow: "hidden", gap: 0,
            background: "var(--surface-2)", border: `2px solid ${value === c.id ? "#42C2EE" : "var(--border)"}`,
            color: "var(--foreground)", minHeight: 180,
          }}>
            <div style={{ ...c.preview, height: 110, width: "100%", position: "relative", display: "flex", flexDirection: "column", padding: 14, justifyContent: "space-between" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, letterSpacing: 2, opacity: 0.7 }}>
                <span>MECHATRO</span>
                <span>REPORT</span>
              </div>
              <div>
                <div style={{ fontSize: c.id === "minimal" ? 22 : 14, fontWeight: 900, lineHeight: 1 }}>
                  {c.id === "minimal" ? "Report" : "Sample Title"}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {[0,1,2].map((i) => (
                    <div key={i} style={{ width: 20, height: 4, borderRadius: 2, background: c.id === "minimal" ? "#D4A017" : (i === 0 ? "#42C2EE" : i === 1 ? "#3ECF8E" : "#F5A623") }} />
                  ))}
                </div>
              </div>
              {value === c.id && (
                <div style={{ position: "absolute", top: 8, insetInlineEnd: 8, width: 24, height: 24, borderRadius: 999, background: "#42C2EE", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={14} />
                </div>
              )}
            </div>
            <div style={{ padding: 12, textAlign: lang === "ar" ? "right" : "left", width: "100%" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{c.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{c.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepPreview({ prepared }: { prepared: { blob: Blob; filename: string; pageCount: number; kind: "team" | "member" } }) {
  const { t } = useApp();
  const url = useMemo(() => URL.createObjectURL(prepared.blob), [prepared.blob]);
  const sizeKb = Math.max(1, Math.round(prepared.blob.size / 1024));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--grad-blue)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <Eye size={22} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{t("reportPreview")}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{prepared.filename} · {prepared.pageCount} {t("page")} · {sizeKb} KB</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 480, background: "#1a1f2e", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
        <iframe src={url} title="preview" style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />
      </div>
    </div>
  );
}
