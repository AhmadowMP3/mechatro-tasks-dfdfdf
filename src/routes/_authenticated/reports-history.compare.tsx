import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/lib/app-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowLeftRight, Download, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { KpiSnapshot } from "@/lib/report/snapshot";
import { buildComparisonHtml } from "@/lib/report/comparison-html";
import { persistComparisonPdf } from "@/lib/report/generator";
import { promptFilename } from "@/components/FilenamePrompt";

type CompareSearch = { a: string; b: string };

export const Route = createFileRoute("/_authenticated/reports-history/compare")({
  validateSearch: (search: Record<string, unknown>): CompareSearch => ({
    a: typeof search.a === "string" ? search.a : "",
    b: typeof search.b === "string" ? search.b : "",
  }),
  component: CompareReportsPage,
  errorComponent: ({ error, reset }) => (
    <div style={{ padding: 24 }}>
      <div style={{ color: "var(--danger)" }}>{(error as Error).message}</div>
      <button onClick={reset} className="brand-btn" style={{ marginTop: 12, background: "var(--grad-blue)", color: "#fff" }}>Retry</button>
    </div>
  ),
  notFoundComponent: () => <div style={{ padding: 24 }}>Not found</div>,

});

type ReportRow = {
  id: string; kind: string; member_id: string | null; member_name_snapshot: string | null;
  generated_by_name_snapshot: string | null; language: "ar" | "en" | "bilingual";
  range_key: string; range_from: string | null; range_to: string | null;
  pdf_path: string; created_at: string;
  kpi_snapshot: KpiSnapshot;
};

type MetricDef = { key: string; label: string; suffix?: string; higherIsBetter: boolean; get: (s: KpiSnapshot) => number };

function CompareReportsPage() {
  const { t, lang } = useApp();
  const { a, b } = Route.useSearch();
  const navigate = useNavigate();
  const [rows, setRows] = useState<{ A: ReportRow | null; B: ReportRow | null }>({ A: null, B: null });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!a || !b) { setLoading(false); return; }
      const { data, error } = await supabase.from("member_reports").select("*").in("id", [a, b]);
      if (error) { toast.error(error.message); setLoading(false); return; }
      const map = new Map(((data ?? []) as unknown as ReportRow[]).map((r) => [r.id, r]));
      setRows({ A: map.get(a) ?? null, B: map.get(b) ?? null });
      setLoading(false);
    })();
  }, [a, b]);

  const A = rows.A, B = rows.B;

  const metrics: MetricDef[] = useMemo(() => [
    { key: "tasks", label: t("totalTasks"), higherIsBetter: true, get: (s) => s.totals.tasks },
    { key: "done", label: t("completed"), higherIsBetter: true, get: (s) => s.totals.done },
    { key: "completion_pct", label: t("completionPct"), suffix: "%", higherIsBetter: true, get: (s) => s.totals.completion_pct },
    { key: "on_time_pct", label: t("onTimePct"), suffix: "%", higherIsBetter: true, get: (s) => s.totals.on_time_pct },
    { key: "overdue", label: t("overdueLbl"), higherIsBetter: false, get: (s) => s.totals.overdue },
    { key: "avg_completion_hours", label: t("avgCompletion"), higherIsBetter: false, get: (s) => s.totals.avg_completion_hours },
    { key: "points", label: t("pointsLbl"), higherIsBetter: true, get: (s) => s.totals.points },
    { key: "rank_position", label: t("rankLbl"), higherIsBetter: false, get: (s) => s.totals.rank_position },
    { key: "sessions", label: t("sessionsLbl"), higherIsBetter: true, get: (s) => s.totals.sessions },
    { key: "hours", label: t("hoursLogged"), higherIsBetter: true, get: (s) => Math.round(s.totals.total_minutes / 60) },
  ], [t]);

  const exportPdf = async () => {
    if (!A || !B) return;
    setExporting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const generatedBy = u.user?.user_metadata?.full_name || u.user?.email || "—";
      const labelA = `${A.range_key} · ${A.language.toUpperCase()}`;
      const labelB = `${B.range_key} · ${B.language.toUpperCase()}`;
      const html = buildComparisonHtml(A.kpi_snapshot, B.kpi_snapshot, {
        labelA, labelB, generated_by: generatedBy, language: lang === "ar" ? "ar" : "en",
      });
      const filename = `Mechatro_Comparison_${A.member_name_snapshot?.replace(/\s+/g, "_")}_vs_${B.member_name_snapshot?.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
      await persistComparisonPdf({
        html, filename,
        memberAId: A.member_id, memberBId: B.member_id,
        memberALabel: A.member_name_snapshot ?? "?", memberBLabel: B.member_name_snapshot ?? "?",
        reportAId: A.id, reportBId: B.id,
        language: lang === "ar" ? "ar" : "en",
        snapshot: { a: A.kpi_snapshot, b: B.kpi_snapshot },
      });
      toast.success("Exported ✓");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>;
  if (!A || !B) return <div style={{ padding: 40 }}>Missing reports</div>;


  const sA = A.kpi_snapshot, sB = B.kpi_snapshot;
  const projA = sA.projects_touched, projB = sB.projects_touched;
  const bIds = new Set(projB.map(p => p.id));
  const aIds = new Set(projA.map(p => p.id));
  const onlyA = projA.filter(p => !bIds.has(p.id));
  const onlyB = projB.filter(p => !aIds.has(p.id));
  const both = projA.filter(p => bIds.has(p.id));

  return (
    <div style={{ padding: "16px clamp(12px, 3vw, 24px) 40px", maxWidth: 1200, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <button onClick={() => navigate({ to: "/reports-history" })} className="brand-btn"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
            <ArrowLeft size={16} /> {t("backToHistory")}
          </button>
          <button onClick={exportPdf} disabled={exporting} className="brand-btn"
            style={{ background: "var(--grad-blue)", color: "#fff", opacity: exporting ? .7 : 1 }}>
            {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />} {t("exportComparison")}
          </button>
        </div>

        <div style={{
          background: "linear-gradient(135deg,var(--sidebar) 0%,#0F5FFF 100%)",
          borderRadius: 20, padding: 24, marginBottom: 20, color: "#fff",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 10%, rgba(245,179,1,.25), transparent 40%)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, fontWeight: 800, color: "var(--brand-gold)", textTransform: "uppercase" }}>{t("headToHead")}</div>
            <div className="compare-hero-grid" style={{ marginTop: 18 }}>
              <ReportHeader label={t("reportA")} row={A} accent="var(--brand-blue)" />
              <div className="compare-hero-arrow" style={{ fontSize: 36, color: "var(--brand-gold)", fontWeight: 900, display: "inline-flex" }}><ArrowLeftRight /></div>
              <ReportHeader label={t("reportB")} row={B} accent="var(--brand-gold)" />
            </div>

          </div>
        </div>

        {/* KPI grid */}
        <div style={{ marginBottom: 20 }}>
          <SectionTitle>{t("kpiDeltas")}</SectionTitle>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", padding: "12px 16px",
              background: "var(--surface-2)", fontSize: 11, fontWeight: 800, letterSpacing: 1,
              color: "var(--muted)", textTransform: "uppercase",
            }}>
              <div>METRIC</div>
              <div style={{ textAlign: "center", color: "var(--brand-blue)" }}>A</div>
              <div style={{ textAlign: "center" }}>Δ</div>
              <div style={{ textAlign: "center", color: "var(--brand-gold)" }}>B</div>
            </div>
            {metrics.map((m) => {
              const av = m.get(sA), bv = m.get(sB);
              const aBetter = m.higherIsBetter ? av > bv : av < bv;
              const bBetter = m.higherIsBetter ? bv > av : bv < av;
              return (
                <div key={m.key} style={{
                  display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                  padding: "14px 16px", borderTop: "1px solid var(--border)", alignItems: "center",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{m.label}</div>
                  <MetricCell v={av} winner={aBetter} suffix={m.suffix} />
                  <DeltaChip a={av} b={bv} higherIsBetter={m.higherIsBetter} suffix={m.suffix} />
                  <MetricCell v={bv} winner={bBetter} suffix={m.suffix} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Status distribution bars */}
        <div style={{ marginBottom: 20 }}>
          <SectionTitle>{t("statusDistribution")}</SectionTitle>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18 }}>
            <StatusBars a={sA.status_dist} b={sB.status_dist} t={t} />
          </div>
        </div>

        {/* Projects venn */}
        <div style={{ marginBottom: 20 }}>
          <SectionTitle>{t("projectsTouched")}</SectionTitle>
          <div className="compare-projects-grid" style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18,
          }}>
            <VennColumn title={`${t("onlyIn")} A`} items={onlyA} accent="var(--brand-blue)" lang={lang} />
            <VennColumn title={t("shared")} items={both} accent="var(--foreground)" lang={lang} />
            <VennColumn title={`${t("onlyIn")} B`} items={onlyB} accent="var(--brand-gold)" lang={lang} />
          </div>
        </div>

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}


function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{
    fontSize: 12, fontWeight: 800, color: "var(--muted)", letterSpacing: 1,
    textTransform: "uppercase", padding: "10px 4px",
  }}>{children}</div>;
}

function ReportHeader({ label, row, accent }: { label: string; row: ReportRow; accent: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,.08)", borderRadius: 14, padding: 16,
      border: `2px solid ${accent}`, backdropFilter: "blur(10px)",
    }}>
      <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 800, color: "var(--brand-gold)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <Avatar id={row.member_id ?? row.id} name={row.member_name_snapshot ?? "?"} size={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.member_name_snapshot}</div>
          <div style={{ fontSize: 11, opacity: .8 }}>{row.range_key} · {row.language.toUpperCase()}</div>
        </div>
      </div>
      <div style={{ fontSize: 10, opacity: .65, marginTop: 8 }}>
        {row.range_from?.slice(0, 10) ?? "—"} → {row.range_to?.slice(0, 10) ?? "—"}
      </div>
    </div>
  );
}

function MetricCell({ v, winner, suffix }: { v: number; winner: boolean; suffix?: string }) {
  return (
    <div style={{
      textAlign: "center", fontSize: 22, fontWeight: 900,
      color: "var(--foreground)",
      background: winner ? "rgba(245,179,1,.14)" : "transparent",
      border: winner ? "2px solid var(--brand-gold)" : "2px solid transparent",
      borderRadius: 10, padding: "8px 6px", margin: "0 8px",
    }}>{v}{suffix ?? ""}</div>
  );
}

function DeltaChip({ a, b, higherIsBetter, suffix }: { a: number; b: number; higherIsBetter: boolean; suffix?: string }) {
  const diff = b - a;
  if (diff === 0) return <div style={{ textAlign: "center", color: "var(--muted)", fontWeight: 700 }}><Minus size={14} /> 0{suffix ?? ""}</div>;
  const positive = higherIsBetter ? diff > 0 : diff < 0;
  const color = positive ? "#12B76A" : "#F04438";
  const abs = Math.abs(diff);
  const pct = a === 0 ? "" : ` (${Math.round((diff / Math.abs(a)) * 100)}%)`;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <div style={{ textAlign: "center", color, fontWeight: 800, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
      <Icon size={14} /> {abs}{suffix ?? ""}{pct}
    </div>
  );
}

function StatusBars({ a, b, t }: { a: Record<string, number>; b: Record<string, number>; t: (k: never) => string }) {
  const keys = ["done", "in_progress", "todo", "paused"] as const;
  const max = Math.max(1, ...keys.flatMap((k) => [a[k] ?? 0, b[k] ?? 0]));
  const label = (k: string) => (t as (k: string) => string)(k);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {keys.map((k) => {
        const av = a[k] ?? 0, bv = b[k] ?? 0;
        return (
          <div key={k}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>{label(k)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: "var(--brand-blue)" }}>A: {av}</div>
              <div style={{ height: 14, background: "var(--surface-2)", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ width: `${(av / max) * 100}%`, height: "100%", background: "var(--brand-blue)" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: 10, alignItems: "center" }}>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: "var(--brand-gold)" }}>B: {bv}</div>
              <div style={{ height: 14, background: "var(--surface-2)", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ width: `${(bv / max) * 100}%`, height: "100%", background: "var(--brand-gold)" }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VennColumn({ title, items, accent, lang }: { title: string; items: KpiSnapshot["projects_touched"]; accent: string; lang: "ar" | "en" }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: .5, marginBottom: 8, textTransform: "uppercase" }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>—</div>
      ) : items.map((p) => (
        <div key={p.id} style={{
          padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, marginBottom: 6,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderInlineStart: `3px solid ${accent}`,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{lang === "ar" ? p.name_ar : p.name_en}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{p.tasks}</span>
        </div>
      ))}
    </div>
  );
}
