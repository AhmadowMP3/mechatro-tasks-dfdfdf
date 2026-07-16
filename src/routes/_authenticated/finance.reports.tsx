import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import {
  formatMoney,
  convertAmount,
  type Currency,
  type Invoice,
  type Expense,
  type IncomeEntry,
  type Customer,
  type FxRate,
} from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { Printer, Download, FileBarChart2, FileSpreadsheet, FileText } from "lucide-react";
import { exportFinanceWorkbook, type FinanceSheetSpec } from "@/lib/finance-xlsx";
import { toast } from "sonner";
import { printReactDocument } from "@/lib/pdf/print-document";
import { ListReportDocument } from "@/components/finance/ListReportDocument";
import { useFinancialSettings } from "@/lib/finance-hooks";


export const Route = createFileRoute("/_authenticated/finance/reports")({
  component: FinanceReports,
});

type Range = { from: string; to: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function firstOfYear(d = new Date()): string {
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}
function firstOfQuarter(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1).toISOString().slice(0, 10);
}
function lastMonthRange(): Range {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function inRange(dateStr: string | null, r: Range): boolean {
  if (!dateStr) return false;
  return dateStr >= r.from && dateStr <= r.to;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function FinanceReports() {
  const { t, lang } = useApp();
  const ar = lang === "ar";
  const [range, setRange] = useState<Range>({ from: firstOfYear(), to: todayIso() });
  const [displayCurrency, setDisplayCurrency] = useState<Currency>("SYP");
  const { data: settings } = useFinancialSettings();


  const { data: latestFx } = useQuery({
    queryKey: ["fx_rates", "latest"],
    queryFn: async () => {
      const { data } = await supabase.from("fx_rates").select("*").order("effective_date", { ascending: false }).limit(1).maybeSingle();
      return data as FxRate | null;
    },
  });
  const rate = Number(latestFx?.syp_per_usd ?? 15000);

  const { data: invoices } = useQuery({
    queryKey: ["invoices", "reports"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("*").order("issue_date", { ascending: false });
      return (data ?? []) as Invoice[];
    },
  });
  const { data: expenses } = useQuery({
    queryKey: ["expenses", "reports"],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      return (data ?? []) as Expense[];
    },
  });
  const { data: income } = useQuery({
    queryKey: ["income_entries", "reports"],
    queryFn: async () => {
      const { data } = await supabase.from("income_entries").select("*").order("income_date", { ascending: false });
      return (data ?? []) as IncomeEntry[];
    },
  });
  const { data: customers } = useQuery({
    queryKey: ["customers", "reports"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("name_en");
      return (data ?? []) as Customer[];
    },
  });
  const { data: projects } = useQuery({
    queryKey: ["projects", "reports"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name_ar, name_en").order("name_en");
      return (data ?? []) as { id: string; name_ar: string; name_en: string }[];
    },
  });

  const conv = (amount: number | string, from: Currency) =>
    convertAmount(typeof amount === "string" ? parseFloat(amount) : amount, from, displayCurrency, rate);

  // Profit & Loss
  const pnl = useMemo(() => {
    let revenue = 0;
    let expTotal = 0;
    const byCat = new Map<string, number>();
    for (const inv of invoices ?? []) {
      if (inv.status === "void" || inv.status === "draft") continue;
      if (!inRange(inv.issue_date, range)) continue;
      revenue += conv(inv.total, inv.currency);
    }
    for (const inc of income ?? []) {
      if (!inRange(inc.income_date, range)) continue;
      revenue += conv(inc.amount, inc.currency);
    }
    for (const exp of expenses ?? []) {
      if (exp.status === "cancelled") continue;
      if (!inRange(exp.expense_date, range)) continue;
      const amt = conv(exp.amount, exp.currency);
      expTotal += amt;
      const key = exp.category_id ?? "uncategorized";
      byCat.set(key, (byCat.get(key) ?? 0) + amt);
    }
    return { revenue, expTotal, net: revenue - expTotal, byCat };
  }, [invoices, income, expenses, range, displayCurrency, rate]);

  // A/R Aging (uses issue_date age; only unpaid/partial/overdue/issued)
  const aging = useMemo(() => {
    const buckets = { b0: 0, b30: 0, b60: 0, b90: 0 };
    const rows: { customer: string; balance: number; days: number; number: string; due: string | null }[] = [];
    const today = new Date();
    for (const inv of invoices ?? []) {
      if (inv.status === "paid" || inv.status === "void" || inv.status === "draft") continue;
      const balance = conv(Number(inv.total) - Number(inv.amount_paid), inv.currency);
      if (balance <= 0) continue;
      const anchor = inv.due_date ?? inv.issue_date;
      const days = Math.max(0, Math.floor((today.getTime() - new Date(anchor).getTime()) / 86400000));
      if (days <= 30) buckets.b0 += balance;
      else if (days <= 60) buckets.b30 += balance;
      else if (days <= 90) buckets.b60 += balance;
      else buckets.b90 += balance;
      const cust = (customers ?? []).find((c) => c.id === inv.customer_id);
      rows.push({
        customer: cust ? ((ar ? cust.name_ar || cust.name_en : cust.name_en || cust.name_ar) ?? "—") : "—",
        balance,
        days,
        number: inv.number ?? "—",
        due: inv.due_date,
      });
    }
    rows.sort((a, b) => b.days - a.days);
    return { buckets, rows, total: buckets.b0 + buckets.b30 + buckets.b60 + buckets.b90 };
  }, [invoices, customers, ar, displayCurrency, rate]);

  // Project profitability
  const projectPnl = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number }>();
    for (const inv of invoices ?? []) {
      if (inv.status === "void" || inv.status === "draft") continue;
      if (!inRange(inv.issue_date, range)) continue;
      if (!inv.project_id) continue;
      const b = map.get(inv.project_id) ?? { revenue: 0, cost: 0 };
      b.revenue += conv(inv.total, inv.currency);
      map.set(inv.project_id, b);
    }
    for (const exp of expenses ?? []) {
      if (exp.status === "cancelled") continue;
      if (!inRange(exp.expense_date, range)) continue;
      if (!exp.project_id) continue;
      const b = map.get(exp.project_id) ?? { revenue: 0, cost: 0 };
      b.cost += conv(exp.amount, exp.currency);
      map.set(exp.project_id, b);
    }
    const rows = Array.from(map.entries()).map(([pid, v]) => {
      const p = (projects ?? []).find((x) => x.id === pid);
      return {
        name: p ? (ar ? p.name_ar || p.name_en : p.name_en || p.name_ar) : "—",
        revenue: v.revenue,
        cost: v.cost,
        margin: v.revenue - v.cost,
      };
    });
    rows.sort((a, b) => b.margin - a.margin);
    return rows;
  }, [invoices, expenses, projects, range, ar, displayCurrency, rate]);

  // Client balances (all-time, not date-filtered — receivables total)
  const clientBalances = useMemo(() => {
    const map = new Map<string, { invoiced: number; paid: number }>();
    for (const inv of invoices ?? []) {
      if (inv.status === "void" || inv.status === "draft") continue;
      const b = map.get(inv.customer_id) ?? { invoiced: 0, paid: 0 };
      b.invoiced += conv(inv.total, inv.currency);
      b.paid += conv(inv.amount_paid, inv.currency);
      map.set(inv.customer_id, b);
    }
    const rows = Array.from(map.entries()).map(([cid, v]) => {
      const c = (customers ?? []).find((x) => x.id === cid);
      return {
        name: c ? ((ar ? c.name_ar || c.name_en : c.name_en || c.name_ar) ?? "—") : "—",
        invoiced: v.invoiced,
        paid: v.paid,
        balance: v.invoiced - v.paid,
      };
    });
    rows.sort((a, b) => b.balance - a.balance);
    return rows;
  }, [invoices, customers, ar, displayCurrency, rate]);

  const fmt = (n: number) => formatMoney(n, displayCurrency, lang);

  const applyPreset = (preset: "month" | "lastMonth" | "quarter" | "year") => {
    if (preset === "month") setRange({ from: firstOfMonth(), to: todayIso() });
    else if (preset === "lastMonth") setRange(lastMonthRange());
    else if (preset === "quarter") setRange({ from: firstOfQuarter(), to: todayIso() });
    else setRange({ from: firstOfYear(), to: todayIso() });
  };

  const exportPnlCsv = () => {
    const rows: (string | number)[][] = [
      [t("profitAndLoss"), `${range.from} → ${range.to}`],
      [],
      [t("grossRevenue"), pnl.revenue.toFixed(2)],
      [t("operatingExpenses"), pnl.expTotal.toFixed(2)],
      [t("netProfit"), pnl.net.toFixed(2)],
    ];
    downloadCsv(`pnl_${range.from}_${range.to}.csv`, rows);
  };
  const exportAgingCsv = () => {
    const rows: (string | number)[][] = [
      [t("reportClient"), t("invoice"), t("dueDate"), t("days"), t("reportBalance")],
      ...aging.rows.map((r) => [r.customer, r.number, r.due ?? "", r.days, r.balance.toFixed(2)]),
    ];
    downloadCsv(`ar_aging_${todayIso()}.csv`, rows);
  };
  const exportProjectCsv = () => {
    const rows: (string | number)[][] = [
      [t("reportProject"), t("reportRevenue"), t("reportCost"), t("reportMargin")],
      ...projectPnl.map((r) => [r.name, r.revenue.toFixed(2), r.cost.toFixed(2), r.margin.toFixed(2)]),
    ];
    downloadCsv(`project_profitability_${range.from}_${range.to}.csv`, rows);
  };
  const exportClientCsv = () => {
    const rows: (string | number)[][] = [
      [t("reportClient"), t("reportInvoiced"), t("reportPaid"), t("reportBalance")],
      ...clientBalances.map((r) => [r.name, r.invoiced.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2)]),
    ];
    downloadCsv(`client_balances_${todayIso()}.csv`, rows);
  };

  const exportAllXlsx = async () => {
    try {
      const rangeSubtitle = `${range.from} → ${range.to}`;
      const sheets: FinanceSheetSpec[] = [
        {
          name: t("profitAndLoss"),
          title: t("profitAndLoss"),
          subtitle: rangeSubtitle,
          columns: [
            { header: t("reportProject"), key: "item", width: 32 },
            { header: t("amount"), key: "amount", kind: "money", width: 22 },
          ],
          rows: [
            { item: t("grossRevenue"), amount: pnl.revenue },
            { item: t("operatingExpenses"), amount: pnl.expTotal },
            { item: t("netProfit"), amount: pnl.net },
          ],
        },
        {
          name: t("accountsReceivable") || "A/R Aging",
          title: t("accountsReceivable") || "A/R Aging",
          subtitle: `${"Aging buckets"} · ${todayIso()}`,
          columns: [
            { header: t("reportClient"), key: "customer", width: 28 },
            { header: t("invoice"), key: "number", width: 14 },
            { header: t("dueDate"), key: "due", kind: "date", width: 14 },
            { header: t("days"), key: "days", kind: "number", width: 10 },
            { header: t("reportBalance"), key: "balance", kind: "money", width: 20 },
          ],
          rows: aging.rows.map((r) => ({ customer: r.customer, number: r.number, due: r.due ?? "", days: r.days, balance: r.balance })),
          totalsRow: { customer: t("totalOutstanding"), balance: aging.total },
        },
        {
          name: t("projectProfitability") || "Projects",
          title: t("projectProfitability") || "Project profitability",
          subtitle: rangeSubtitle,
          columns: [
            { header: t("reportProject"), key: "name", width: 30 },
            { header: t("reportRevenue"), key: "revenue", kind: "money", width: 20 },
            { header: t("reportCost"), key: "cost", kind: "money", width: 20 },
            { header: t("reportMargin"), key: "margin", kind: "money", width: 20 },
          ],
          rows: projectPnl.map((r) => ({ name: r.name, revenue: r.revenue, cost: r.cost, margin: r.margin })),
          totalsRow: {
            name: t("totalOutstanding"),
            revenue: projectPnl.reduce((s, r) => s + r.revenue, 0),
            cost: projectPnl.reduce((s, r) => s + r.cost, 0),
            margin: projectPnl.reduce((s, r) => s + r.margin, 0),
          },
        },
        {
          name: t("clientBalances") || "Clients",
          title: t("clientBalances") || "Client balances",
          subtitle: todayIso(),
          columns: [
            { header: t("reportClient"), key: "name", width: 30 },
            { header: t("reportInvoiced"), key: "invoiced", kind: "money", width: 20 },
            { header: t("reportPaid"), key: "paid", kind: "money", width: 20 },
            { header: t("reportBalance"), key: "balance", kind: "money", width: 20 },
          ],
          rows: clientBalances.map((r) => ({ name: r.name, invoiced: r.invoiced, paid: r.paid, balance: r.balance })),
          totalsRow: {
            name: t("totalOutstanding"),
            invoiced: clientBalances.reduce((s, r) => s + r.invoiced, 0),
            paid: clientBalances.reduce((s, r) => s + r.paid, 0),
            balance: clientBalances.reduce((s, r) => s + r.balance, 0),
          },
        },
      ];
      await exportFinanceWorkbook(sheets, lang, displayCurrency, `finance-reports-${range.from}_${range.to}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const exportAllPdf = async () => {
    try {
      const rangeLabel = `${range.from} → ${range.to}`;
      const fmtVal = (n: number) => formatMoney(n, displayCurrency, lang);
      // P&L sheet
      await printReactDocument(
        <>
          <ListReportDocument
            title={t("financeReports")}
            subtitle={t("profitAndLoss")}
            rangeLabel={rangeLabel}
            kpis={[
              { label: t("grossRevenue"), value: fmtVal(pnl.revenue), tone: "green" },
              { label: t("operatingExpenses"), value: fmtVal(pnl.expTotal), tone: "red" },
              { label: t("netProfit"), value: fmtVal(pnl.net), tone: pnl.net >= 0 ? "green" : "red" },
              { label: t("netMargin"), value: pnl.revenue > 0 ? `${((pnl.net / pnl.revenue) * 100).toFixed(1)}%` : "—", tone: "blue" },
            ]}
            columns={[
              { header: t("reportClient"), key: "customer", bold: true },
              { header: t("invoice"), key: "number" },
              { header: t("dueDate"), key: "due" },
              { header: t("days"), key: "days", align: "end" },
              { header: t("reportBalance"), key: "balance", align: "end", bold: true, tone: (r: { daysN: number }) => (r.daysN > 90 ? "red" : r.daysN > 30 ? "gold" : undefined) },
            ]}
            rows={aging.rows.slice(0, 60).map((r) => ({
              customer: r.customer,
              number: r.number,
              due: r.due ? formatDate(r.due, lang) : "—",
              days: String(r.days),
              daysN: r.days,
              balance: fmtVal(r.balance),
            }))}
            totals={[
              { label: ar ? "إجمالي المستحقات" : "Total outstanding", value: fmtVal(aging.total), tone: "gold" },
            ]}
            settings={settings ?? null}
            lang={lang}
          />
        </>,
        { title: `finance-report_${range.from}_${range.to}`, lang },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };



  const th: React.CSSProperties = {
    textAlign: ar ? "right" : "left",
    padding: "10px 12px",
    fontSize: 12,
    color: "var(--muted)",
    fontWeight: 600,
    borderBottom: "1px solid var(--border)",
    background: "var(--surface-2)",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    borderBottom: "1px solid var(--border)",
  };

  return (
    <div style={{ display: "grid", gap: 16 }} className="finance-reports-root">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .finance-reports-root, .finance-reports-root * { visibility: visible; }
          .finance-reports-root { position: absolute; inset: 0; padding: 0 !important; }
          .no-print { display: none !important; }
          .brand-card { box-shadow: none !important; border-color: #ddd !important; break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, display: "flex", alignItems: "center", gap: 10 }}>
            <FileBarChart2 size={22} />
            {t("financeReports")}
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{t("financeReportsDesc")}</p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "var(--surface-2)", borderRadius: 10, padding: 3, border: "1px solid var(--border)" }}>
            {(["SYP", "USD"] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setDisplayCurrency(c)}
                className="brand-btn-sm"
                style={{
                  background: displayCurrency === c ? "var(--grad-blue)" : "transparent",
                  color: displayCurrency === c ? "#fff" : "var(--foreground)",
                  border: "none",
                  minWidth: 60,
                }}
              >
                {c === "SYP" ? t("syp") : t("usd")}
              </button>
            ))}
          </div>
          <button className="brand-btn-sm" onClick={exportAllXlsx} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--grad-blue)", color: "#fff", border: "none" }}>
            <FileSpreadsheet size={14} /> {t("exportXlsx")}
          </button>
          <button className="brand-btn-sm" onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Printer size={14} /> {t("exportPdf")}
          </button>
        </div>
      </div>

      {/* Range picker */}
      <section className="brand-card no-print" style={{ padding: 16, display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{t("rangeFrom")}</div>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="brand-input"
            style={{ padding: "8px 10px" }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{t("rangeTo")}</div>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="brand-input"
            style={{ padding: "8px 10px" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="brand-btn-sm" onClick={() => applyPreset("month")}>{t("rangeThisMonth")}</button>
          <button className="brand-btn-sm" onClick={() => applyPreset("lastMonth")}>{t("rangeLastMonth")}</button>
          <button className="brand-btn-sm" onClick={() => applyPreset("quarter")}>{t("rangeThisQuarter")}</button>
          <button className="brand-btn-sm" onClick={() => applyPreset("year")}>{t("rangeThisYear")}</button>
        </div>
      </section>

      {/* P&L */}
      <section className="brand-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{t("profitAndLoss")}</h3>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {formatDate(range.from, lang)} — {formatDate(range.to, lang)}
            </div>
          </div>
          <button className="brand-btn-sm no-print" onClick={exportPnlCsv} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> {t("exportCsv")}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 10 }}>
          <PnlBox label={t("grossRevenue")} value={fmt(pnl.revenue)} tone="green" />
          <PnlBox label={t("operatingExpenses")} value={fmt(pnl.expTotal)} tone="red" />
          <PnlBox label={t("netProfit")} value={fmt(pnl.net)} tone={pnl.net >= 0 ? "green" : "red"} />
          <PnlBox
            label={t("netMargin")}
            value={pnl.revenue > 0 ? `${((pnl.net / pnl.revenue) * 100).toFixed(1)}%` : "—"}
            tone={pnl.net >= 0 ? "blue" : "red"}
          />
        </div>
      </section>

      {/* A/R Aging */}
      <section className="brand-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{t("arAging")}</h3>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {t("totalOutstanding")}: <strong style={{ color: "var(--foreground)" }}>{fmt(aging.total)}</strong>
            </div>
          </div>
          <button className="brand-btn-sm no-print" onClick={exportAgingCsv} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> {t("exportCsv")}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10, marginBottom: 14 }}>
          <PnlBox label={t("ageBucket0_30")} value={fmt(aging.buckets.b0)} tone="blue" />
          <PnlBox label={t("ageBucket31_60")} value={fmt(aging.buckets.b30)} tone="orange" />
          <PnlBox label={t("ageBucket61_90")} value={fmt(aging.buckets.b60)} tone="orange" />
          <PnlBox label={t("ageBucketOver90")} value={fmt(aging.buckets.b90)} tone="red" />
        </div>
        {aging.rows.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: 16, textAlign: "center", fontSize: 13 }}>—</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>{t("reportClient")}</th>
                  <th style={th}>{t("invoice")}</th>
                  <th style={th}>{t("dueDate")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("days")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("reportBalance")}</th>
                </tr>
              </thead>
              <tbody>
                {aging.rows.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.customer}</td>
                    <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>{r.number}</td>
                    <td style={td}>{r.due ? formatDate(r.due, lang) : "—"}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right", color: r.days > 90 ? "#F0676A" : r.days > 30 ? "#FBBF24" : "var(--foreground)" }}>{r.days}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right", fontWeight: 700 }}>{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Project profitability */}
      <section className="brand-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{t("projectProfitability")}</h3>
          <button className="brand-btn-sm no-print" onClick={exportProjectCsv} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> {t("exportCsv")}
          </button>
        </div>
        {projectPnl.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: 16, textAlign: "center", fontSize: 13 }}>{t("noDataInRange")}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>{t("reportProject")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("reportRevenue")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("reportCost")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("reportMargin")}</th>
                </tr>
              </thead>
              <tbody>
                {projectPnl.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.name}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right" }}>{fmt(r.revenue)}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right" }}>{fmt(r.cost)}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right", fontWeight: 700, color: r.margin >= 0 ? "#50C878" : "#F0676A" }}>
                      {fmt(r.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Client balances */}
      <section className="brand-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{t("clientBalances")}</h3>
          <button className="brand-btn-sm no-print" onClick={exportClientCsv} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> {t("exportCsv")}
          </button>
        </div>
        {clientBalances.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: 16, textAlign: "center", fontSize: 13 }}>—</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>{t("reportClient")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("reportInvoiced")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("reportPaid")}</th>
                  <th style={{ ...th, textAlign: ar ? "left" : "right" }}>{t("reportBalance")}</th>
                </tr>
              </thead>
              <tbody>
                {clientBalances.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.name}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right" }}>{fmt(r.invoiced)}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right" }}>{fmt(r.paid)}</td>
                    <td style={{ ...td, textAlign: ar ? "left" : "right", fontWeight: 700, color: r.balance > 0 ? "#FBBF24" : "var(--foreground)" }}>
                      {fmt(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PnlBox({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "blue" | "orange" }) {
  const c = tone === "green" ? "#50C878" : tone === "red" ? "#F0676A" : tone === "orange" ? "#FBBF24" : "#60A5FA";
  return (
    <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{value}</div>
    </div>
  );
}
