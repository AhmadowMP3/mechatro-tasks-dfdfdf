import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/security/db";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, CheckCircle2, Lock, Unlock, Printer, Settings2, ChevronDown, ChevronUp, Download } from "lucide-react";
import {
  formatMoney,
  monthLabel,
  payrollStatusKey,
  type PayrollPeriod,
  type PayrollEntry,
  type MemberSalarySettings,
  type Currency,
  type PayrollPeriodStatus,
} from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { useConfirm } from "@/components/confirm-dialog";
import { renderAndDownloadPdf } from "@/lib/pdf-render";
import { stampFilename } from "@/lib/pdf/brand";
import { PayrollSlipDocument, type CompanySettings } from "@/components/finance/BrandedDocuments";
import { ExportMenu } from "@/components/finance/ExportMenu";
import { exportFinanceListPdf, exportFinanceListXlsx } from "@/lib/finance-list-export";
import { useFinancialSettings } from "@/lib/finance-hooks";


export const Route = createFileRoute("/_authenticated/finance/payroll")({
  component: PayrollPage,
});

type Profile = { id: string; full_name: string; role: string; avatar_url: string | null; total_points: number; current_streak: number; active: boolean; status: string };

function PayrollPage() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { data: periods } = useQuery({
    queryKey: ["payroll_periods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("*").order("year", { ascending: false }).order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollPeriod[];
    },
  });

  const removePeriod = async (p: PayrollPeriod) => {
    if (!(await confirm({ message: t("confirmDeletePayrollPeriod"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("payroll_periods").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["payroll_periods"] });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>{t("payroll")}</h1>
        <button onClick={() => setShowSettings(true)} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
          <Settings2 size={16} /> {t("memberSalarySettings")}
        </button>
        <button onClick={() => setShowNewModal(true)} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
          <Plus size={16} /> {t("newPayrollPeriod")}
        </button>
      </div>

      {(periods ?? []).length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noPayrollPeriods")}</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {(periods ?? []).map((p) => (
            <PeriodCard
              key={p.id}
              period={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onDelete={() => removePeriod(p)}
            />
          ))}
        </div>
      )}

      {showNewModal && <NewPeriodModal onClose={() => setShowNewModal(false)} onSaved={() => { setShowNewModal(false); qc.invalidateQueries({ queryKey: ["payroll_periods"] }); }} />}
      {showSettings && <SalarySettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function PeriodCard({ period, expanded, onToggle, onDelete }: { period: PayrollPeriod; expanded: boolean; onToggle: () => void; onDelete: () => void }) {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const { data: entries } = useQuery({
    queryKey: ["payroll_entries", period.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_entries").select("*").eq("period_id", period.id);
      if (error) throw error;
      return (data ?? []) as PayrollEntry[];
    },
    enabled: expanded,
  });

  const totalNet = useMemo(() => (entries ?? []).reduce((s, e) => s + Number(e.net_amount), 0), [entries]);
  const currency: Currency = (entries?.[0]?.currency ?? "SYP") as Currency;
  const locked = period.status !== "draft";
  const statusColor = period.status === "draft" ? "#9CA3AF" : period.status === "finalized" ? "#60A5FA" : "#50C878";

  const { data: settings } = useFinancialSettings();
  const { data: profsForExport } = useQuery({
    queryKey: ["profiles", "for-payroll-export", period.id],
    queryFn: async () => {
      const ids = (entries ?? []).map((e) => e.user_id);
      if (ids.length === 0) return [] as Array<{ id: string; full_name: string }>;
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (data ?? []) as Array<{ id: string; full_name: string }>;
    },
    enabled: expanded && (entries?.length ?? 0) > 0,
  });
  const profMapEx = useMemo(() => {
    const m = new Map<string, string>();
    (profsForExport ?? []).forEach((p) => m.set(p.id, p.full_name));
    return m;
  }, [profsForExport]);

  const buildExport = () => {
    const ar = lang === "ar";
    const list = entries ?? [];
    const label = `${monthLabel(period.month, lang)} ${period.year}`;
    return {
      slug: `payroll_${period.year}-${String(period.month).padStart(2, "0")}`,
      title: `${t("payroll")} — ${label}`,
      subtitle: ar ? "كشف الرواتب" : "Payroll register",
      rangeLabel: `${list.length} ${ar ? "قيد" : "entries"}`,
      kpis: [
        { label: t("entriesCount"), value: String(list.length), tone: "blue" as const },
        { label: t("totalNet"), value: formatMoney(totalNet, currency, lang), tone: "green" as const },
      ],
      columns: [
        { header: t("member"), key: "member", bold: true },
        { header: ar ? "الراتب الأساسي" : "Base", key: "base", align: "end" as const },
        { header: ar ? "بدلات" : "Allowances", key: "allow", align: "end" as const },
        { header: ar ? "مكافآت" : "Bonuses", key: "bonus", align: "end" as const },
        { header: ar ? "خصومات" : "Deductions", key: "ded", align: "end" as const, tone: () => "red" as const },
        { header: t("totalNet"), key: "net", align: "end" as const, bold: true, tone: () => "green" as const },
      ],
      rows: list.map((e) => ({
        member: profMapEx.get(e.user_id) ?? e.user_id.slice(0, 8),
        base: formatMoney(e.base_salary, e.currency as Currency, lang),
        allow: formatMoney(Number(e.transport_allowance) + Number(e.other_allowance), e.currency as Currency, lang),
        bonus: formatMoney(Number(e.points_bonus) + Number(e.streak_bonus) + Number(e.manual_bonus), e.currency as Currency, lang),
        ded: formatMoney(e.deductions, e.currency as Currency, lang),
        net: formatMoney(e.net_amount, e.currency as Currency, lang),
      })),
      totalsPdf: [{ label: t("totalNet"), value: formatMoney(totalNet, currency, lang), tone: "green" as const }],
      xlsxColumns: [
        { header: t("member"), key: "member", width: 24 },
        { header: ar ? "الراتب الأساسي" : "Base", key: "base_num", kind: "money" as const, width: 16 },
        { header: ar ? "بدلات" : "Allowances", key: "allow_num", kind: "money" as const, width: 16 },
        { header: ar ? "مكافآت" : "Bonuses", key: "bonus_num", kind: "money" as const, width: 16 },
        { header: ar ? "خصومات" : "Deductions", key: "ded_num", kind: "money" as const, width: 16 },
        { header: t("totalNet"), key: "net_num", kind: "money" as const, width: 18 },
      ],
      xlsxRows: list.map((e) => ({
        member: profMapEx.get(e.user_id) ?? "",
        base_num: Number(e.base_salary),
        allow_num: Number(e.transport_allowance) + Number(e.other_allowance),
        bonus_num: Number(e.points_bonus) + Number(e.streak_bonus) + Number(e.manual_bonus),
        ded_num: Number(e.deductions),
        net_num: Number(e.net_amount),
      })),
      totalsXlsx: { member: ar ? "الإجمالي" : "Total", net_num: totalNet },
      settings: settings ?? null,
      lang,
      currency: currency as string,
    };
  };


  const generate = async () => {
    // Fetch profiles + settings
    const { data: profs, error: e1 } = await supabase
      .from("profiles")
      .select("id, full_name, total_points, current_streak")
      .eq("active", true)
      .eq("status", "active");
    if (e1) { toast.error(e1.message); return; }
    const { data: settings } = await supabase.from("member_salary_settings").select("*");
    const settingsMap = new Map<string, MemberSalarySettings>();
    (settings ?? []).forEach((s) => settingsMap.set(s.user_id, s as MemberSalarySettings));

    // Snapshot approved tasks for month
    const from = new Date(period.year, period.month - 1, 1).toISOString();
    const to = new Date(period.year, period.month, 1).toISOString();
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("assignee_id, points_awarded_amount")
      .not("points_awarded_at", "is", null)
      .gte("points_awarded_at", from)
      .lt("points_awarded_at", to);
    const taskAgg = new Map<string, { pts: number; count: number }>();
    (taskRows ?? []).forEach((r) => {
      if (!r.assignee_id) return;
      const cur = taskAgg.get(r.assignee_id) ?? { pts: 0, count: 0 };
      cur.pts += Number(r.points_awarded_amount ?? 0);
      cur.count += 1;
      taskAgg.set(r.assignee_id, cur);
    });

    const rows = (profs ?? []).map((p) => {
      const s = settingsMap.get(p.id);
      const agg = taskAgg.get(p.id) ?? { pts: 0, count: 0 };
      const base = Number(s?.base_salary ?? 0);
      const transport = Number(s?.transport_allowance ?? 0);
      const other = Number(s?.other_fixed_allowance ?? 0);
      const rate = Number(s?.points_bonus_rate ?? 0);
      const pointsBonus = Math.round(agg.pts * rate * 100) / 100;
      const net = base + transport + other + pointsBonus;
      return {
        period_id: period.id,
        user_id: p.id,
        currency: (s?.currency ?? "SYP") as Currency,
        base_salary: base,
        transport_allowance: transport,
        other_allowance: other,
        points_bonus: pointsBonus,
        streak_bonus: 0,
        manual_bonus: 0,
        deductions: 0,
        net_amount: net,
        points_snapshot: agg.pts,
        tasks_done_snapshot: agg.count,
      };
    });
    // Upsert (replace existing rows for this period)
    await supabase.from("payroll_entries").delete().eq("period_id", period.id);
    const { error } = await supabase.from("payroll_entries").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["payroll_entries", period.id] });
  };

  const finalize = async () => {
    if (!(await confirm({ message: t("confirmFinalizePayroll"), confirmText: t("finalizePeriod") }))) return;
    const { error } = await supabase.from("payroll_periods").update({ status: "finalized", finalized_at: new Date().toISOString() }).eq("id", period.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["payroll_periods"] });
  };
  const reopen = async () => {
    if (!(await confirm({ message: t("confirmReopenPayroll"), confirmText: t("reopenPeriod") }))) return;
    const { error } = await supabase.from("payroll_periods").update({ status: "draft", finalized_at: null, paid_at: null }).eq("id", period.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["payroll_periods"] });
  };
  const markAllPaid = async () => {
    const now = new Date().toISOString();
    await supabase.from("payroll_entries").update({ paid_at: now }).eq("period_id", period.id).is("paid_at", null);
    await supabase.from("payroll_periods").update({ status: "paid", paid_at: now }).eq("id", period.id);
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["payroll_periods"] });
    qc.invalidateQueries({ queryKey: ["payroll_entries", period.id] });
  };

  return (
    <div className="brand-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14 }}>
        <button onClick={onToggle} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--foreground)", display: "flex", alignItems: "center", gap: 8, flex: 1, padding: 0, textAlign: "start" }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{monthLabel(period.month, lang)} {period.year}</div>
            {period.notes && <div style={{ fontSize: 12, color: "var(--muted)" }}>{period.notes}</div>}
          </div>
        </button>
        <span style={{ padding: "4px 10px", borderRadius: 12, background: statusColor + "22", color: statusColor, fontSize: 11, fontWeight: 700 }}>
          {t(payrollStatusKey(period.status))}
        </span>
        {!locked && (
          <button onClick={onDelete} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)", padding: "6px 8px" }}>
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: 14, background: "var(--surface-2)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {!locked && (
              <>
                <button onClick={generate} className="brand-btn-sm" style={{ background: "var(--grad-blue)", color: "#fff" }}>
                  <RefreshCw size={12} /> {(entries?.length ?? 0) > 0 ? t("regenerateEntries") : t("generateEntries")}
                </button>
                {(entries?.length ?? 0) > 0 && (
                  <button onClick={finalize} className="brand-btn-sm" style={{ background: "rgba(80,200,120,.15)", color: "#50C878", border: "1px solid rgba(80,200,120,.35)" }}>
                    <Lock size={12} /> {t("finalizePeriod")}
                  </button>
                )}
              </>
            )}
            {period.status === "finalized" && (
              <>
                <button onClick={markAllPaid} className="brand-btn-sm" style={{ background: "rgba(80,200,120,.15)", color: "#50C878", border: "1px solid rgba(80,200,120,.35)" }}>
                  <CheckCircle2 size={12} /> {t("markPeriodPaid")}
                </button>
                <button onClick={reopen} className="brand-btn-sm" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
                  <Unlock size={12} /> {t("reopenPeriod")}
                </button>
              </>
            )}
            {(entries?.length ?? 0) > 0 && (
              <ExportMenu
                onExportPdf={() => exportFinanceListPdf(buildExport())}
                onExportXlsx={() => exportFinanceListXlsx(buildExport())}
              />
            )}
          </div>


          {(entries ?? []).length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              {locked ? t("noPayrollPeriods") : (lang === "ar" ? "لم يتم توليد الكشف بعد. اضغط توليد لبدء الحساب." : "No entries yet. Click Generate to compute them.")}
            </div>
          ) : (
            <EntriesTable entries={entries ?? []} locked={locked} periodId={period.id} />
          )}

          <div style={{ marginTop: 12, textAlign: "end", fontSize: 14, color: "var(--muted)" }}>
            {t("entriesCount")}: <b style={{ color: "var(--foreground)" }}>{entries?.length ?? 0}</b>
            {" · "}
            {t("totalNet")}: <b style={{ color: "#50C878" }}>{formatMoney(totalNet, currency, lang)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function EntriesTable({ entries, locked, periodId }: { entries: PayrollEntry[]; locked: boolean; periodId: string }) {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PayrollEntry | null>(null);
  const [slip, setSlip] = useState<PayrollEntry | null>(null);

  const { data: profs } = useQuery({
    queryKey: ["profiles", "for-payroll", periodId],
    queryFn: async () => {
      const ids = entries.map((e) => e.user_id);
      const { data } = await supabase.from("profiles").select("id, full_name, job_title, avatar_url").in("id", ids);
      return (data ?? []) as Array<{ id: string; full_name: string; job_title: string | null; avatar_url: string | null }>;
    },
    enabled: entries.length > 0,
  });
  const profMap = useMemo(() => {
    const m = new Map<string, { full_name: string; job_title: string | null; avatar_url: string | null }>();
    (profs ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profs]);

  return (
    <>
      <div className="table-scroll" style={{ overflowX: "auto", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", background: "var(--surface-2)" }}>
              <th style={th}>{t("member")}</th>
              <th style={{ ...th, textAlign: "end" }}>{t("baseSalary")}</th>
              <th style={{ ...th, textAlign: "end" }}>{t("transportAllowance")}</th>
              <th style={{ ...th, textAlign: "end" }}>{t("pointsBonus")}</th>
              <th style={{ ...th, textAlign: "end" }}>{t("manualBonus")}</th>
              <th style={{ ...th, textAlign: "end" }}>{t("deductions")}</th>
              <th style={{ ...th, textAlign: "end" }}>{t("netAmount")}</th>
              <th style={{ ...th, width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const p = profMap.get(e.user_id);
              return (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{p?.full_name ?? "—"}</div>
                    {p?.job_title && <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.job_title}</div>}
                  </td>
                  <td style={{ ...td, textAlign: "end" }}>{formatMoney(e.base_salary, e.currency, lang)}</td>
                  <td style={{ ...td, textAlign: "end" }}>{formatMoney(e.transport_allowance, e.currency, lang)}</td>
                  <td style={{ ...td, textAlign: "end" }}>
                    {formatMoney(e.points_bonus, e.currency, lang)}
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{e.points_snapshot} pts · {e.tasks_done_snapshot} tasks</div>
                  </td>
                  <td style={{ ...td, textAlign: "end" }}>{formatMoney(e.manual_bonus, e.currency, lang)}</td>
                  <td style={{ ...td, textAlign: "end", color: "#F0676A" }}>{formatMoney(e.deductions, e.currency, lang)}</td>
                  <td style={{ ...td, textAlign: "end", fontWeight: 700, color: "#50C878" }}>{formatMoney(e.net_amount, e.currency, lang)}</td>
                  <td style={{ ...td, textAlign: "end" }}>
                    <button onClick={() => setSlip(e)} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px", marginInlineEnd: 4 }} title={t("paySlip")}>
                      <Printer size={12} />
                    </button>
                    {!locked && (
                      <button onClick={() => setEditing(e)} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px" }}>
                        <Settings2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EntryEditModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["payroll_entries", periodId] }); }}
        />
      )}
      {slip && (
        <PaySlipModal
          entry={slip}
          member={profMap.get(slip.user_id) ?? null}
          onClose={() => setSlip(null)}
        />
      )}
    </>
  );
}

function EntryEditModal({ entry, onClose, onSaved }: { entry: PayrollEntry; onClose: () => void; onSaved: () => void }) {
  const { t } = useApp();
  const [form, setForm] = useState({
    base_salary: Number(entry.base_salary),
    transport_allowance: Number(entry.transport_allowance),
    other_allowance: Number(entry.other_allowance),
    points_bonus: Number(entry.points_bonus),
    streak_bonus: Number(entry.streak_bonus),
    manual_bonus: Number(entry.manual_bonus),
    deductions: Number(entry.deductions),
    notes: entry.notes ?? "",
  });
  const net = form.base_salary + form.transport_allowance + form.other_allowance + form.points_bonus + form.streak_bonus + form.manual_bonus - form.deductions;
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("payroll_entries").update({ ...form, net_amount: net, notes: form.notes || null }).eq("id", entry.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    onSaved();
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{t("payroll")}</h2>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          {(["base_salary","transport_allowance","other_allowance","points_bonus","streak_bonus","manual_bonus","deductions"] as const).map((k) => (
            <Field key={k} label={t(({ base_salary:"baseSalary", transport_allowance:"transportAllowance", other_allowance:"otherAllowance", points_bonus:"pointsBonus", streak_bonus:"streakBonus", manual_bonus:"manualBonus", deductions:"deductions" } as const)[k])}>
              <input type="number" step="0.01" value={form[k]} onChange={(e) => setForm({ ...form, [k]: parseFloat(e.target.value) || 0 })} style={inp} />
            </Field>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: 12, background: "var(--surface-2)", borderRadius: 10, textAlign: "end", fontSize: 15 }}>
          {t("netAmount")}: <b style={{ color: "#50C878" }}>{formatMoney(net, entry.currency, "en")}</b>
        </div>
        <Field label={t("notesEnglish")}><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={inp} /></Field>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
          <button onClick={save} disabled={saving} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", opacity: saving ? 0.6 : 1 }}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

function PaySlipModal({ entry, member, onClose }: { entry: PayrollEntry; member: { full_name: string; job_title: string | null } | null; onClose: () => void }) {
  const { t, lang, user } = useApp();
  const { data: period } = useQuery({
    queryKey: ["payroll_period", entry.period_id],
    queryFn: async () => {
      const { data } = await supabase.from("payroll_periods").select("*").eq("id", entry.period_id).maybeSingle();
      return data as PayrollPeriod | null;
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["financial_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_settings").select("*").maybeSingle();
      return data;
    },
  });

  return (
    <div style={backdrop} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#111", borderRadius: 16, maxWidth: 720, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div className="print-slip" style={{ padding: 32 }}>
          <div style={{ background: "var(--grad-blue, linear-gradient(135deg,#3B82F6,#1E40AF))", color: "#fff", padding: "16px 20px", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{lang === "ar" ? (settings?.company_name_ar ?? "ميكاترو") : (settings?.company_name_en ?? "Mechatro")}</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{lang === "ar" ? (settings?.company_address_ar ?? "") : (settings?.company_address_en ?? "")}</div>
            </div>
            <img src="/mechatro-logo.png" alt="logo" style={{ height: 40 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>{t("paySlip")}</h2>
          <div style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>{period && `${monthLabel(period.month, lang)} ${period.year}`}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, padding: 12, background: "#f8fafc", borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#666" }}>{t("member")}</div>
              <div style={{ fontWeight: 700 }}>{member?.full_name ?? "—"}</div>
              {member?.job_title && <div style={{ fontSize: 12, color: "#666" }}>{member.job_title}</div>}
            </div>
            <div style={{ textAlign: "end" }}>
              <div style={{ fontSize: 11, color: "#666" }}>{t("paidAt")}</div>
              <div style={{ fontWeight: 600 }}>{entry.paid_at ? formatDate(entry.paid_at, lang) : "—"}</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              <SlipRow label={t("baseSalary")} value={formatMoney(entry.base_salary, entry.currency, lang)} />
              <SlipRow label={t("transportAllowance")} value={formatMoney(entry.transport_allowance, entry.currency, lang)} />
              <SlipRow label={t("otherAllowance")} value={formatMoney(entry.other_allowance, entry.currency, lang)} />
              <SlipRow label={`${t("pointsBonus")} (${entry.points_snapshot} pts · ${entry.tasks_done_snapshot} tasks)`} value={formatMoney(entry.points_bonus, entry.currency, lang)} />
              <SlipRow label={t("streakBonus")} value={formatMoney(entry.streak_bonus, entry.currency, lang)} />
              <SlipRow label={t("manualBonus")} value={formatMoney(entry.manual_bonus, entry.currency, lang)} />
              <SlipRow label={t("deductions")} value={"-" + formatMoney(entry.deductions, entry.currency, lang)} negative />
              <tr style={{ borderTop: "2px solid #111" }}>
                <td style={{ padding: "14px 8px", fontWeight: 800, fontSize: 16 }}>{t("netAmount")}</td>
                <td style={{ padding: "14px 8px", textAlign: "end", fontWeight: 800, fontSize: 18, color: "#0e7c3a" }}>{formatMoney(entry.net_amount, entry.currency, lang)}</td>
              </tr>
            </tbody>
          </table>

          {entry.notes && <div style={{ marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>{entry.notes}</div>}

          <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, fontSize: 12 }}>
            <div style={{ borderTop: "1px solid #ccc", paddingTop: 6, textAlign: "center", color: "#666" }}>{lang === "ar" ? "توقيع الموظف" : "Employee Signature"}</div>
            <div style={{ borderTop: "1px solid #ccc", paddingTop: 6, textAlign: "center", color: "#666" }}>{lang === "ar" ? "توقيع الإدارة" : "Authorized Signature"}</div>
          </div>
        </div>
        <div className="no-print" style={{ padding: 16, background: "#f1f5f9", display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid #e2e8f0" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "#fff", color: "#111", border: "1px solid #cbd5e1" }}>{t("cancel")}</button>
          <button
            onClick={async () => {
              try {
                await renderAndDownloadPdf(
                  <PayrollSlipDocument
                    entry={{
                      id: entry.id,
                      base_salary: Number(entry.base_salary),
                      housing_allowance: 0,
                      transport_allowance: Number(entry.transport_allowance),
                      other_allowance: Number(entry.other_allowance),
                      points_snapshot: entry.points_snapshot,
                      tasks_done_snapshot: entry.tasks_done_snapshot,
                      points_bonus: Number(entry.points_bonus),
                      streak_bonus: Number(entry.streak_bonus),
                      manual_bonus: Number(entry.manual_bonus),
                      deductions: Number(entry.deductions),
                      net_amount: Number(entry.net_amount),
                      notes: entry.notes,
                    }}
                    memberName={member?.full_name ?? "—"}
                    periodLabel={period ? `${monthLabel(period.month, lang)} ${period.year}` : ""}
                    currency={entry.currency}
                    settings={(settings as CompanySettings | null) ?? null}
                    lang={lang}
                  />,
                  stampFilename("payslip", `${member?.full_name?.replace(/\s+/g, "-") ?? entry.id.slice(0, 6)}-${period ? `${period.year}-${String(period.month).padStart(2, "0")}` : ""}`),
                  { chrome: { lang, generatedBy: user?.full_name ?? null } },
                );
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              }
            }}
            className="brand-btn"
            style={{ background: "var(--grad-blue)", color: "#fff" }}
          >
            <Download size={16} /> {t("downloadPdf")}
          </button>
          <button onClick={() => window.print()} className="brand-btn" style={{ background: "#3B82F6", color: "#fff" }}>
            <Printer size={16} /> {t("printPaySlip")}
          </button>
        </div>
      </div>
      <style>{`@media print { body * { visibility: hidden; } .print-slip, .print-slip * { visibility: visible; } .print-slip { position: absolute; inset: 0; padding: 40px !important; } .no-print { display: none !important; } }`}</style>
    </div>
  );
}


function SlipRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <tr style={{ borderTop: "1px solid #e5e7eb" }}>
      <td style={{ padding: "10px 8px", color: "#374151" }}>{label}</td>
      <td style={{ padding: "10px 8px", textAlign: "end", fontWeight: 600, color: negative ? "#dc2626" : "#111" }}>{value}</td>
    </tr>
  );
}

type WizardMode = "manual" | "auto";
type WizardRow = {
  user_id: string;
  full_name: string;
  job_title: string | null;
  currency: Currency;
  base_salary: number;
  transport_allowance: number;
  other_allowance: number;
  points_bonus: number;
  manual_bonus: number;
  deductions: number;
  points_snapshot: number;
  tasks_done_snapshot: number;
};

function NewPeriodModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, lang, user } = useApp();
  const now = new Date();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mode, setMode] = useState<WizardMode>("manual");
  const [rows, setRows] = useState<WizardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, i) => monthLabel(i + 1, lang)), [lang]);

  const loadRows = async (m: WizardMode) => {
    setLoading(true);
    try {
      const { data: profs, error: e1 } = await supabase
        .from("profiles")
        .select("id, full_name, job_title, total_points, current_streak")
        .eq("active", true)
        .eq("status", "active")
        .order("full_name");
      if (e1) throw e1;
      const { data: settings } = await supabase.from("member_salary_settings").select("*");
      const sMap = new Map<string, MemberSalarySettings>();
      (settings ?? []).forEach((s) => sMap.set(s.user_id, s as MemberSalarySettings));

      let taskAgg = new Map<string, { pts: number; count: number }>();
      if (m === "auto") {
        const from = new Date(year, month - 1, 1).toISOString();
        const to = new Date(year, month, 1).toISOString();
        const { data: taskRows } = await supabase
          .from("tasks")
          .select("assignee_id, points_awarded_amount")
          .not("points_awarded_at", "is", null)
          .gte("points_awarded_at", from)
          .lt("points_awarded_at", to);
        (taskRows ?? []).forEach((r) => {
          if (!r.assignee_id) return;
          const cur = taskAgg.get(r.assignee_id) ?? { pts: 0, count: 0 };
          cur.pts += Number(r.points_awarded_amount ?? 0);
          cur.count += 1;
          taskAgg.set(r.assignee_id, cur);
        });
      }

      const next: WizardRow[] = (profs ?? []).map((p) => {
        const s = sMap.get(p.id);
        const agg = taskAgg.get(p.id) ?? { pts: 0, count: 0 };
        const rate = Number(s?.points_bonus_rate ?? 0);
        const pointsBonus = m === "auto" ? Math.round(agg.pts * rate * 100) / 100 : 0;
        return {
          user_id: p.id,
          full_name: p.full_name,
          job_title: (p as { job_title?: string | null }).job_title ?? null,
          currency: (s?.currency ?? "SYP") as Currency,
          base_salary: Number(s?.base_salary ?? 0),
          transport_allowance: Number(s?.transport_allowance ?? 0),
          other_allowance: Number(s?.other_fixed_allowance ?? 0),
          points_bonus: pointsBonus,
          manual_bonus: 0,
          deductions: 0,
          points_snapshot: agg.pts,
          tasks_done_snapshot: agg.count,
        };
      });
      setRows(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const goNext = async () => {
    if (step === 1) { setStep(2); return; }
    if (step === 2) { await loadRows(mode); setStep(3); return; }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: period, error: e1 } = await supabase
        .from("payroll_periods")
        .insert({ year, month, created_by: user?.id })
        .select("id")
        .single();
      if (e1) throw e1;
      if (rows.length > 0) {
        const inserts = rows.map((r) => {
          const net = r.base_salary + r.transport_allowance + r.other_allowance + r.points_bonus + r.manual_bonus - r.deductions;
          return {
            period_id: period.id,
            user_id: r.user_id,
            currency: r.currency,
            base_salary: r.base_salary,
            transport_allowance: r.transport_allowance,
            other_allowance: r.other_allowance,
            points_bonus: r.points_bonus,
            streak_bonus: 0,
            manual_bonus: r.manual_bonus,
            deductions: r.deductions,
            net_amount: net,
            points_snapshot: r.points_snapshot,
            tasks_done_snapshot: r.tasks_done_snapshot,
          };
        });
        const { error: e2 } = await supabase.from("payroll_entries").insert(inserts);
        if (e2) throw e2;
      }
      toast.success(t("saved"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<WizardRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div
        className="brand-card"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--card)", padding: 0, borderRadius: 16, maxWidth: step === 3 ? 820 : 560, width: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {/* Header + progress */}
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{t("newPayrollPeriod")}</h2>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{step} / 3</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ flex: 1, height: 6, borderRadius: 3, background: n <= step ? "var(--grad-blue)" : "var(--surface-2)" }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
          {step === 1 && (
            <div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>{t("pickMonth")}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 20 }}>
                <button onClick={() => setYear(year - 1)} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", width: 44, height: 44, padding: 0, fontSize: 20 }}>‹</button>
                <div style={{ fontSize: 28, fontWeight: 800, minWidth: 100, textAlign: "center" }}>{year}</div>
                <button onClick={() => setYear(year + 1)} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", width: 44, height: 44, padding: 0, fontSize: 20 }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {monthNames.map((name, i) => {
                  const m = i + 1;
                  const active = m === month;
                  return (
                    <button
                      key={m}
                      onClick={() => setMonth(m)}
                      style={{
                        padding: "18px 8px",
                        borderRadius: 12,
                        border: active ? "2px solid transparent" : "1px solid var(--border)",
                        background: active ? "var(--grad-blue)" : "var(--surface-2)",
                        color: active ? "#fff" : "var(--foreground)",
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "transform .1s",
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>{t("chooseMode")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {(["manual", "auto"] as const).map((m) => {
                  const active = mode === m;
                  const title = m === "manual" ? t("manualEntry") : t("autoFromPoints");
                  const hint = m === "manual" ? t("manualEntryHint") : t("autoFromPointsHint");
                  return (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        textAlign: "start",
                        padding: 18,
                        borderRadius: 14,
                        border: active ? "2px solid #189FD1" : "1px solid var(--border)",
                        background: active ? "rgba(24,159,209,.10)" : "var(--surface-2)",
                        color: "var(--foreground)",
                        cursor: "pointer",
                        minHeight: 160,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 999, border: active ? "6px solid #189FD1" : "2px solid var(--border)", background: "var(--card)" }} />
                        <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
                        {m === "manual" && (
                          <span style={{ marginInlineStart: "auto", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "rgba(80,200,120,.18)", color: "#50C878" }}>{t("recommended")}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
                {monthLabel(month, lang)} {year} · {mode === "manual" ? t("manualEntry") : t("autoFromPoints")}
              </div>
              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>…</div>
              ) : rows.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>—</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {rows.map((r, i) => {
                    const net = r.base_salary + r.transport_allowance + r.other_allowance + r.points_bonus + r.manual_bonus - r.deductions;
                    return (
                      <div key={r.user_id} style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{r.full_name}</div>
                            {r.job_title && <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.job_title}</div>}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "#50C878" }}>{formatMoney(net, r.currency, lang)}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                          <WizField label={t("baseSalary")} value={r.base_salary} onChange={(v) => updateRow(i, { base_salary: v })} />
                          <WizField label={t("pointsBonus") + " + " + t("manualBonus")} value={r.points_bonus + r.manual_bonus} onChange={(v) => updateRow(i, { manual_bonus: Math.max(0, v - r.points_bonus) })} />
                          <WizField label={t("transportAllowance")} value={r.transport_allowance} onChange={(v) => updateRow(i, { transport_allowance: v })} />
                          <WizField label={t("deductions")} value={r.deductions} onChange={(v) => updateRow(i, { deductions: v })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "space-between", background: "var(--card)" }}>
          <button
            onClick={step === 1 ? onClose : () => setStep((s) => (s - 1) as 1 | 2 | 3)}
            className="brand-btn"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", minHeight: 52, minWidth: 120, fontSize: 15, fontWeight: 700 }}
          >
            {step === 1 ? t("cancel") : t("back")}
          </button>
          {step < 3 ? (
            <button onClick={goNext} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", minHeight: 52, minWidth: 160, fontSize: 16, fontWeight: 800 }}>
              {t("next")} ›
            </button>
          ) : (
            <button onClick={save} disabled={saving || loading} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", minHeight: 52, minWidth: 200, fontSize: 16, fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
              {saving ? "…" : t("savePayroll")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WizField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ padding: "10px 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 15, fontWeight: 600, width: "100%" }}
      />
    </label>
  );
}

function SalarySettingsModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useApp();
  const qc = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ["members", "for-salary"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, job_title, avatar_url")
        .eq("active", true)
        .eq("status", "active")
        .order("full_name");
      return (data ?? []) as Array<{ id: string; full_name: string; job_title: string | null; avatar_url: string | null }>;
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["member_salary_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("member_salary_settings").select("*");
      return (data ?? []) as MemberSalarySettings[];
    },
  });
  const map = useMemo(() => {
    const m = new Map<string, MemberSalarySettings>();
    (settings ?? []).forEach((s) => m.set(s.user_id, s));
    return m;
  }, [settings]);

  const save = async (
    user_id: string,
    patch: { base_salary: number; transport_allowance: number; other_fixed_allowance: number; points_bonus_rate: number; currency: Currency },
  ) => {
    const { error } = await supabase.from("member_salary_settings").upsert({ user_id, ...patch });
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["member_salary_settings"] });
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 900, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{t("memberSalarySettings")}</h2>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", background: "var(--surface-2)" }}>
                <th style={th}>{t("member")}</th>
                <th style={th}>{t("baseSalary")}</th>
                <th style={th}>{t("transportAllowance")}</th>
                <th style={th}>{t("otherAllowance")}</th>
                <th style={th}>{t("pointsBonusRate")}</th>
                <th style={th}>{t("currency")}</th>
                <th style={{ ...th, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((p) => (
                <SalaryRow key={p.id} member={p} current={map.get(p.id)} onSave={(patch) => save(p.id, patch)} />
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

function SalaryRow({ member, current, onSave }: { member: { id: string; full_name: string; job_title: string | null }; current: MemberSalarySettings | undefined; onSave: (p: { base_salary: number; transport_allowance: number; other_fixed_allowance: number; points_bonus_rate: number; currency: Currency }) => void }) {
  const [form, setForm] = useState({
    base_salary: Number(current?.base_salary ?? 0),
    transport_allowance: Number(current?.transport_allowance ?? 0),
    other_fixed_allowance: Number(current?.other_fixed_allowance ?? 0),
    points_bonus_rate: Number(current?.points_bonus_rate ?? 0),
    currency: (current?.currency ?? "SYP") as Currency,
  });
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={td}>
        <div style={{ fontWeight: 600 }}>{member.full_name}</div>
        {member.job_title && <div style={{ fontSize: 11, color: "var(--muted)" }}>{member.job_title}</div>}
      </td>
      <td style={td}><input type="number" step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: 120 }} /></td>
      <td style={td}><input type="number" step="0.01" value={form.transport_allowance} onChange={(e) => setForm({ ...form, transport_allowance: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: 100 }} /></td>
      <td style={td}><input type="number" step="0.01" value={form.other_fixed_allowance} onChange={(e) => setForm({ ...form, other_fixed_allowance: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: 100 }} /></td>
      <td style={td}><input type="number" step="0.0001" value={form.points_bonus_rate} onChange={(e) => setForm({ ...form, points_bonus_rate: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: 90 }} /></td>
      <td style={td}>
        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })} style={{ ...inp, width: 80 }}>
          <option value="SYP">SYP</option>
          <option value="USD">USD</option>
        </select>
      </td>
      <td style={{ ...td, textAlign: "end" }}>
        <button onClick={() => onSave(form)} className="brand-btn-sm" style={{ background: "var(--grad-blue)", color: "#fff" }}>
          <CheckCircle2 size={12} />
        </button>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const inp: React.CSSProperties = { padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 13, width: "100%" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "start", fontSize: 11, fontWeight: 700, textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
