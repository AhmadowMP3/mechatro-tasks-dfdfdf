import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { formatMoney, convertAmount, type Currency, type Invoice, type Expense, type IncomeEntry, type FxRate } from "@/lib/finance";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle, RefreshCw, Plus, Wallet, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/finance/")({
  component: FinanceDashboard,
});

function FinanceDashboard() {
  const { t, lang, user } = useApp();
  const [displayCurrency, setDisplayCurrency] = useState<Currency>("SYP");

  const { data: latestFx } = useQuery({
    queryKey: ["fx_rates", "latest"],
    queryFn: async () => {
      const { data } = await supabase.from("fx_rates").select("*").order("effective_date", { ascending: false }).limit(1).maybeSingle();
      return data as FxRate | null;
    },
  });

  const rate = Number(latestFx?.syp_per_usd ?? 15000);

  const { data: invoices } = useQuery({
    queryKey: ["invoices", "dashboard"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("*").order("issue_date", { ascending: false });
      return (data ?? []) as Invoice[];
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["expenses", "dashboard"],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      return (data ?? []) as Expense[];
    },
  });

  const { data: income } = useQuery({
    queryKey: ["income_entries", "dashboard"],
    queryFn: async () => {
      const { data } = await supabase.from("income_entries").select("*").order("income_date", { ascending: false });
      return (data ?? []) as IncomeEntry[];
    },
  });

  const kpi = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let mtdIncome = 0, ytdIncome = 0;
    let mtdExpenses = 0, ytdExpenses = 0;
    let outstandingAR = 0;

    // Income from invoices (via amount_paid) + direct income entries
    for (const inv of invoices ?? []) {
      if (inv.status === "void") continue;
      const paid = convertAmount(Number(inv.amount_paid), inv.currency, displayCurrency, rate);
      const total = convertAmount(Number(inv.total), inv.currency, displayCurrency, rate);
      const balance = Math.max(0, total - paid);
      if (inv.status !== "draft") outstandingAR += balance;
      const d = new Date(inv.issue_date);
      if (d >= startOfMonth) mtdIncome += paid;
      if (d >= startOfYear) ytdIncome += paid;
    }
    for (const inc of income ?? []) {
      const amt = convertAmount(Number(inc.amount), inc.currency, displayCurrency, rate);
      const d = new Date(inc.income_date);
      if (d >= startOfMonth) mtdIncome += amt;
      if (d >= startOfYear) ytdIncome += amt;
    }
    for (const exp of expenses ?? []) {
      if (exp.status === "cancelled") continue;
      const amt = convertAmount(Number(exp.amount), exp.currency, displayCurrency, rate);
      const d = new Date(exp.expense_date);
      if (d >= startOfMonth) mtdExpenses += amt;
      if (d >= startOfYear) ytdExpenses += amt;
    }

    return {
      mtdIncome, ytdIncome, mtdExpenses, ytdExpenses,
      mtdNet: mtdIncome - mtdExpenses,
      ytdNet: ytdIncome - ytdExpenses,
      outstandingAR,
    };
  }, [invoices, expenses, income, rate, displayCurrency]);

  // 12-month bar chart data
  const monthlySeries = useMemo(() => {
    const months: { key: string; label: string; income: number; expenses: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { month: "short" });
      months.push({ key, label, income: 0, expenses: 0 });
    }
    const bucket = new Map(months.map((m) => [m.key, m]));
    for (const inv of invoices ?? []) {
      if (inv.status === "void") continue;
      const d = new Date(inv.issue_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = bucket.get(k);
      if (b) b.income += convertAmount(Number(inv.amount_paid), inv.currency, displayCurrency, rate);
    }
    for (const inc of income ?? []) {
      const d = new Date(inc.income_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = bucket.get(k);
      if (b) b.income += convertAmount(Number(inc.amount), inc.currency, displayCurrency, rate);
    }
    for (const exp of expenses ?? []) {
      if (exp.status === "cancelled") continue;
      const d = new Date(exp.expense_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = bucket.get(k);
      if (b) b.expenses += convertAmount(Number(exp.amount), exp.currency, displayCurrency, rate);
    }
    return months;
  }, [invoices, expenses, income, rate, displayCurrency, lang]);

  const maxBar = Math.max(1, ...monthlySeries.flatMap((m) => [m.income, m.expenses]));

  const outstanding = (invoices ?? []).filter((i) => i.status === "issued" || i.status === "partially_paid" || i.status === "overdue").slice(0, 5);

  const firstName = (user?.full_name ?? "").trim().split(/\s+/)[0] || "";
  const today = new Date().toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greetingAr = firstName ? `أهلاً ${firstName}` : "أهلاً بك";
  const greetingEn = firstName ? `Hi ${firstName}` : "Welcome";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{lang === "ar" ? greetingAr : greetingEn}</h1>
          <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 15 }}>{today}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("currency")}:</span>
          <div style={{ display: "inline-flex", background: "var(--surface-2)", borderRadius: 12, padding: 4, border: "1px solid var(--border)" }}>
            {(["SYP", "USD"] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setDisplayCurrency(c)}
                className="brand-btn-sm"
                style={{
                  background: displayCurrency === c ? "var(--grad-blue)" : "transparent",
                  color: displayCurrency === c ? "#fff" : "var(--foreground)",
                  border: "none",
                  minWidth: 68,
                }}
              >
                {c === "SYP" ? t("syp") : t("usd")}
              </button>
            ))}
          </div>
          {latestFx && (
            <span style={{ fontSize: 12, color: "var(--muted)", marginInlineStart: 8 }}>
              1 USD = {Number(latestFx.syp_per_usd).toLocaleString()} SYP
            </span>
          )}
        </div>
      </div>

      {/* Quick actions — priorities for master admin */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <Link to="/finance/income" className="quick-action">
          <span className="qa-icon" style={{ background: "linear-gradient(135deg,#50C878,#3d9c5e)" }}><Plus size={22} /></span>
          <span>
            {lang === "ar" ? "تسجيل دخل" : "Log income"}
            <span className="qa-sub">{lang === "ar" ? "أضف مدخول جديد" : "Add new income entry"}</span>
          </span>
        </Link>
        <Link to="/finance/expenses" className="quick-action">
          <span className="qa-icon" style={{ background: "linear-gradient(135deg,#F0676A,#c94446)" }}><Plus size={22} /></span>
          <span>
            {lang === "ar" ? "تسجيل مصروف" : "Log expense"}
            <span className="qa-sub">{lang === "ar" ? "أضف مصروف جديد" : "Add new expense"}</span>
          </span>
        </Link>
        <Link to="/finance/payroll" className="quick-action">
          <span className="qa-icon"><Wallet size={22} /></span>
          <span>
            {lang === "ar" ? "الرواتب" : "Run payroll"}
            <span className="qa-sub">{lang === "ar" ? "احسب رواتب الشهر" : "Compute this month's payroll"}</span>
          </span>
        </Link>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <KpiCard icon={TrendingUp} label={t("totalIncome") + " · " + t("monthToDate")} value={formatMoney(kpi.mtdIncome, displayCurrency, lang)} tone="green" />
        <KpiCard icon={TrendingDown} label={t("totalExpenses") + " · " + t("monthToDate")} value={formatMoney(kpi.mtdExpenses, displayCurrency, lang)} tone="red" />
        <KpiCard icon={DollarSign} label={t("netProfit") + " · " + t("monthToDate")} value={formatMoney(kpi.mtdNet, displayCurrency, lang)} tone={kpi.mtdNet >= 0 ? "green" : "red"} />
        <KpiCard icon={AlertCircle} label={t("accountsReceivable")} value={formatMoney(kpi.outstandingAR, displayCurrency, lang)} tone="orange" />
        <KpiCard icon={TrendingUp} label={t("totalIncome") + " · " + t("yearToDate")} value={formatMoney(kpi.ytdIncome, displayCurrency, lang)} tone="blue" />
        <KpiCard icon={DollarSign} label={t("netProfit") + " · " + t("yearToDate")} value={formatMoney(kpi.ytdNet, displayCurrency, lang)} tone={kpi.ytdNet >= 0 ? "green" : "red"} />
      </div>

      {/* Monthly Chart */}
      <section className="brand-card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>{t("incomeVsExpenses")} · 12 {lang === "ar" ? "شهر" : "months"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${monthlySeries.length}, 1fr)`, gap: 6, alignItems: "end", height: 180 }}>
          {monthlySeries.map((m) => (
            <div key={m.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", gap: 2, alignItems: "end", height: 140, width: "100%", justifyContent: "center" }}>
                <div title={`Income: ${formatMoney(m.income, displayCurrency, lang)}`} style={{ width: 10, background: "var(--grad-green, linear-gradient(135deg,#50C878,#3d9c5e))", height: `${(m.income / maxBar) * 100}%`, borderRadius: "3px 3px 0 0", minHeight: m.income > 0 ? 2 : 0 }} />
                <div title={`Expenses: ${formatMoney(m.expenses, displayCurrency, lang)}`} style={{ width: 10, background: "linear-gradient(135deg,#F0676A,#c94446)", height: `${(m.expenses / maxBar) * 100}%`, borderRadius: "3px 3px 0 0", minHeight: m.expenses > 0 ? 2 : 0 }} />
              </div>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{m.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 12, color: "var(--muted)", justifyContent: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, background: "#50C878", borderRadius: 2 }} /> {t("totalIncome")}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, background: "#F0676A", borderRadius: 2 }} /> {t("totalExpenses")}
          </span>
        </div>
      </section>

      {/* Outstanding invoices */}
      <section className="brand-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{t("outstandingInvoices")}</h3>
          <Link to="/finance/invoices" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>{t("filterAll")} →</Link>
        </div>
        {outstanding.length === 0 ? (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 20, fontSize: 13 }}>—</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {outstanding.map((inv) => {
              const balance = Number(inv.total) - Number(inv.amount_paid);
              return (
                <Link
                  key={inv.id}
                  to="/finance/invoices/$id"
                  params={{ id: inv.id }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", textDecoration: "none", color: "var(--foreground)" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.number}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(inv.issue_date, lang)}</div>
                  </div>
                  <div style={{ textAlign: lang === "ar" ? "left" : "right" }}>
                    <div style={{ fontWeight: 700, color: inv.status === "overdue" ? "#F0676A" : "var(--foreground)" }}>
                      {formatMoney(balance, inv.currency, lang)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{t(inv.status === "overdue" ? "invoiceOverdue" : "amountDue")}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {!latestFx && (
        <div className="brand-card" style={{ padding: 16, borderColor: "rgba(245,158,11,.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <RefreshCw size={16} color="#FBBF24" />
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {lang === "ar"
                ? "لم يتم ضبط سعر الصرف بعد. عيّنه من إعدادات المالية للحصول على تحويلات دقيقة."
                : "No FX rate set yet. Configure it in Financial Settings for accurate conversions."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string; tone: "green" | "red" | "blue" | "orange" }) {
  const toneColor = tone === "green" ? "#50C878" : tone === "red" ? "#F0676A" : tone === "orange" ? "#FBBF24" : "#60A5FA";
  return (
    <div className="brand-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "var(--muted)" }}>
        <Icon size={14} color={toneColor} />
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: toneColor }}>{value}</div>
    </div>
  );
}
