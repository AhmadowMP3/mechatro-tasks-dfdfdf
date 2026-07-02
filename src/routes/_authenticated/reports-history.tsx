import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";
import { FileText, Download, Eye, Trash2, GitCompareArrows, X, CheckCircle2, ArrowLeftRight, Users2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";

export const Route = createFileRoute("/_authenticated/reports-history")({
  component: ReportsHistoryPage,
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div style={{ padding: 24 }}>
        <div style={{ color: "var(--danger)" }}>Failed to load: {(error as Error).message}</div>
        <button onClick={reset} className="brand-btn" style={{ marginTop: 12, background: "var(--grad-blue)", color: "#fff" }}>Retry</button>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => <AppShell><div style={{ padding: 24 }}>Not found</div></AppShell>,
});

type ReportRow = {
  id: string;
  kind: "member" | "comparison";
  member_id: string | null;
  member_name_snapshot: string | null;
  generated_by: string | null;
  generated_by_name_snapshot: string | null;
  language: "ar" | "en" | "bilingual";
  range_key: string;
  range_from: string | null;
  range_to: string | null;
  pdf_path: string;
  pdf_size_bytes: number | null;
  page_count: number | null;
  compare_member_a: string | null;
  compare_member_b: string | null;
  compare_report_a: string | null;
  compare_report_b: string | null;
  created_at: string;
};

const LANG_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  ar: { bg: "rgba(15,95,255,.12)", fg: "var(--brand-blue)", label: "AR" },
  en: { bg: "rgba(245,179,1,.12)", fg: "var(--brand-gold)", label: "EN" },
  bilingual: { bg: "rgba(148,89,209,.12)", fg: "#9459D1", label: "AR+EN" },
};

function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10) + " " + d.toTimeString().slice(0, 5);
}

function ReportsHistoryPage() {
  const { t, lang } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "member" | "comparison">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<ReportRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("member_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as ReportRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.kind !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(r.member_name_snapshot ?? "").toLowerCase().includes(q) &&
            !(r.generated_by_name_snapshot ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const grouped = useMemo(() => {
    const g: Record<string, ReportRow[]> = {};
    for (const r of filtered) {
      const day = r.created_at.slice(0, 10);
      (g[day] ||= []).push(r);
    }
    return Object.entries(g).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const openSignedUrl = async (path: string, download = false) => {
    const { data, error } = await supabase.storage.from("member-reports")
      .createSignedUrl(path, 60, download ? { download: path.split("/").pop() } : undefined);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const doDelete = async (r: ReportRow) => {
    try {
      await supabase.storage.from("member-reports").remove([r.pdf_path]);
      const { error } = await supabase.from("member_reports").delete().eq("id", r.id);
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      await logActivity(u.user?.id ?? null, "report.deleted", "report", r.id, { member_id: r.member_id, path: r.pdf_path });
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setSelected((prev) => prev.filter((x) => x !== r.id));
      toast.success("Deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirmDel(null);
    }
  };

  const doCompare = () => {
    if (selected.length !== 2) return;
    navigate({ to: "/reports-history/compare", search: { a: selected[0], b: selected[1] } });
  };

  const chip = (k: typeof filter) => ({
    padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
    border: `1px solid ${filter === k ? "var(--brand-blue)" : "var(--border)"}`,
    background: filter === k ? "var(--grad-blue)" : "var(--surface-2)",
    color: filter === k ? "#fff" : "var(--foreground)",
    minHeight: 40,
  } as React.CSSProperties);

  return (
    <AppShell>
      <div style={{ padding: "20px 24px 120px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--grad-blue)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <FileText size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, color: "var(--foreground)" }}>{t("reportHistory")}</h1>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("reportHistoryDesc")}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <button style={chip("all")} onClick={() => setFilter("all")}>{t("allKinds")} · {rows.length}</button>
          <button style={chip("member")} onClick={() => setFilter("member")}>{t("memberReports")} · {rows.filter(r => r.kind === "member").length}</button>
          <button style={chip("comparison")} onClick={() => setFilter("comparison")}>{t("comparisonReports")} · {rows.filter(r => r.kind === "comparison").length}</button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === "ar" ? "بحث…" : "Search…"}
            style={{
              flex: 1, minWidth: 200, minHeight: 40, padding: "8px 12px",
              borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--surface-2)", color: "var(--foreground)",
            }}
          />
        </div>

        {loading && <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>}

        {!loading && filtered.length === 0 && (
          <div style={{
            padding: 60, textAlign: "center", background: "var(--surface-2)",
            border: "1px dashed var(--border)", borderRadius: 16,
          }}>
            <FileText size={48} style={{ opacity: 0.4, marginBottom: 12 }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>{t("noReports")}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>{t("noReportsDesc")}</div>
          </div>
        )}

        {grouped.map(([day, items]) => (
          <div key={day} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: "var(--muted)", letterSpacing: 1,
              textTransform: "uppercase", padding: "10px 4px",
            }}>{day}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {items.map((r) => {
                const chipLang = LANG_CHIP[r.language];
                const isSelected = selected.includes(r.id);
                const isComparison = r.kind === "comparison";
                return (
                  <div key={r.id} style={{
                    background: "var(--surface)", border: `1px solid ${isSelected ? "var(--brand-gold)" : "var(--border)"}`,
                    borderRadius: 14, padding: 14, display: "flex", gap: 14, alignItems: "center",
                    boxShadow: isSelected ? "0 0 0 3px rgba(245,179,1,.18)" : "none",
                    transition: "all .15s",
                  }}>
                    <button
                      onClick={() => toggleSelect(r.id)}
                      title={isSelected ? t("selectedForCompare") : t("selectForCompare")}
                      style={{
                        width: 34, height: 34, borderRadius: 10, cursor: "pointer",
                        border: `2px solid ${isSelected ? "var(--brand-gold)" : "var(--border)"}`,
                        background: isSelected ? "var(--brand-gold)" : "transparent",
                        color: isSelected ? "#0F1B2D" : "var(--muted)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >{isSelected ? <CheckCircle2 size={18} /> : <GitCompareArrows size={16} />}</button>

                    {isComparison ? (
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,var(--brand-blue),var(--brand-gold))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <ArrowLeftRight size={20} />
                      </div>
                    ) : (
                      <Avatar id={r.member_id ?? r.id} name={r.member_name_snapshot ?? "?"} size={40} />
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)" }}>
                          {r.member_name_snapshot ?? "—"}
                        </div>
                        {isComparison && (
                          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 800, letterSpacing: .5, background: "linear-gradient(135deg,var(--brand-blue),var(--brand-gold))", color: "#fff" }}>COMPARISON</span>
                        )}
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 800, background: chipLang.bg, color: chipLang.fg }}>{chipLang.label}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "var(--surface-2)", color: "var(--muted)" }}>{r.range_key}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span><Users2 size={12} style={{ verticalAlign: "middle" }} /> {r.generated_by_name_snapshot ?? "—"}</span>
                        <span>{fmtDate(r.created_at)}</span>
                        <span>{r.page_count ? `${r.page_count} pages` : ""}</span>
                        <span>{fmtBytes(r.pdf_size_bytes)}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openSignedUrl(r.pdf_path, false)} title={t("preview")}
                        style={iconBtn}><Eye size={16} /></button>
                      <button onClick={() => openSignedUrl(r.pdf_path, true)} title={t("download")}
                        style={{ ...iconBtn, background: "var(--grad-blue)", color: "#fff", borderColor: "transparent" }}><Download size={16} /></button>
                      <button onClick={() => setConfirmDel(r)} title={t("deleteReport")}
                        style={{ ...iconBtn, color: "var(--danger)" }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected.length > 0 && (
        <div style={{
          position: "fixed", bottom: 20, insetInline: 20, zIndex: 40,
          maxWidth: 720, margin: "0 auto",
          background: "var(--surface)", border: "2px solid var(--brand-gold)",
          borderRadius: 16, padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,.35)",
        }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
            {selected.length === 1 ? t("selectOneMore") : `${t("reportA")} · ${t("reportB")} ✓`}
          </div>
          <button onClick={() => setSelected([])} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
            <X size={16} /> {t("clearSelection")}
          </button>
          <button onClick={doCompare} disabled={selected.length !== 2} className="brand-btn"
            style={{ background: selected.length === 2 ? "var(--grad-blue)" : "var(--surface-2)", color: "#fff", opacity: selected.length === 2 ? 1 : .5 }}>
            <GitCompareArrows size={16} /> {t("compareReports")}
          </button>
        </div>
      )}

      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--surface)", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%",
            border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)", marginBottom: 8 }}>{t("deleteReport")}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>{t("confirmDeleteReport")}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="brand-btn" onClick={() => setConfirmDel(null)}
                style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel") as string}</button>
              <button className="brand-btn" onClick={() => doDelete(confirmDel)}
                style={{ background: "var(--danger)", color: "#fff" }}><Trash2 size={16} /> {t("deleteReport")}</button>
            </div>
          </div>
        </div>
      )}
      <Link to="/reports-history" style={{ display: "none" }}>hidden</Link>
    </AppShell>
  );
}

const iconBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, cursor: "pointer",
  border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--foreground)", display: "flex", alignItems: "center", justifyContent: "center",
};
