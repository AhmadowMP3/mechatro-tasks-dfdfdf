import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, RefreshCw, AlertTriangle } from "lucide-react";
import {
  formatMoney,
  subscriptionCycleKey,
  type Currency,
  type SubscriptionCycle,
  type SubscriptionStatus,
  type SubscriptionExpense,
  type SubscriptionIncome,
  type Customer,
} from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { useConfirm } from "@/components/confirm-dialog";
import { ExportMenu } from "@/components/finance/ExportMenu";
import { exportFinanceListPdf, exportFinanceListXlsx } from "@/lib/finance-list-export";
import { useFinancialSettings } from "@/lib/finance-hooks";


export const Route = createFileRoute("/_authenticated/finance/subscriptions")({
  component: SubscriptionsPage,
});

type Tab = "expense" | "income";

function SubscriptionsPage() {
  const { t, lang } = useApp();
  const [tab, setTab] = useState<Tab>("expense");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>{t("subscriptions")}</h1>
      </div>

      <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 4, borderRadius: 10, width: "fit-content" }}>
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === k ? "var(--grad-blue)" : "transparent",
              color: tab === k ? "#fff" : "var(--foreground)",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {t(k === "expense" ? "subscriptionsExpense" : "subscriptionsIncome")}
          </button>
        ))}
      </div>

      {tab === "expense" ? <ExpenseSubs /> : <IncomeSubs />}
    </div>
  );
}

function ExpenseSubs() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SubscriptionExpense | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: rows } = useQuery({
    queryKey: ["subscriptions_expense"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions_expense").select("*").order("next_renewal_date");
      if (error) throw error;
      return (data ?? []) as SubscriptionExpense[];
    },
  });

  const remove = async (s: SubscriptionExpense) => {
    if (!(await confirm({ message: t("confirmDeleteSubscription"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("subscriptions_expense").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["subscriptions_expense"] });
  };

  const renew = async (s: SubscriptionExpense) => {
    // Find salaries category? use "Software" fallback? Grab a category id.
    const { data: cats } = await supabase.from("expense_categories").select("id, name_en").limit(50);
    const softwareCat = cats?.find((c) => c.name_en?.toLowerCase() === "software") ?? cats?.[0];
    if (!softwareCat) { toast.error("Add an expense category first"); return; }

    const { error: exErr } = await supabase.from("expenses").insert({
      expense_date: s.next_renewal_date,
      category_id: softwareCat.id,
      vendor: s.vendor,
      description_en: `${s.name} — renewal`,
      description_ar: `${s.name} — تجديد`,
      amount: s.amount,
      currency: s.currency,
      method: "bank_transfer",
      status: "paid",
      reference: `SUB-${s.id.slice(0, 8)}`,
    });
    if (exErr) { toast.error(exErr.message); return; }
    const { data: nextData } = await supabase.rpc("advance_subscription_date", { base_date: s.next_renewal_date, c: s.cycle });
    const next = nextData as unknown as string;
    await supabase.from("subscriptions_expense").update({ next_renewal_date: next }).eq("id", s.id);
    toast.success(t("renewedCreatedExpense"));
    qc.invalidateQueries({ queryKey: ["subscriptions_expense"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };

  const today = new Date().toISOString().slice(0, 10);

  const { data: settings } = useFinancialSettings();
  const buildExport = () => {
    const ar = lang === "ar";
    const list = rows ?? [];
    const currency = (list[0]?.currency ?? "SYP") as string;
    return {
      slug: "subscriptions-expense",
      title: t("subscriptionsExpense"),
      subtitle: ar ? "الاشتراكات — مصاريف" : "Expense subscriptions",
      rangeLabel: `${list.length} ${ar ? "اشتراك" : "subscriptions"}`,
      kpis: [
        { label: ar ? "العدد" : "Count", value: String(list.length), tone: "blue" as const },
        { label: ar ? "المجموع الشهري" : "Monthly total", value: formatMoney(list.filter((s) => s.cycle === "monthly").reduce((a, s) => a + Number(s.amount), 0), currency as never, lang), tone: "red" as const },
      ],
      columns: [
        { header: t("planName"), key: "name", bold: true },
        { header: t("vendor"), key: "vendor" },
        { header: t("cycle"), key: "cycle" },
        { header: t("amount"), key: "amount", align: "end" as const, tone: () => "red" as const },
        { header: t("nextRenewal"), key: "next" },
        { header: t("status"), key: "status" },
      ],
      rows: list.map((s) => ({
        name: s.name,
        vendor: s.vendor ?? "—",
        cycle: t(subscriptionCycleKey(s.cycle)),
        amount: formatMoney(s.amount, s.currency, lang),
        next: formatDate(s.next_renewal_date, lang),
        status: s.status,
      })),
      xlsxColumns: [
        { header: t("planName"), key: "name", width: 24 },
        { header: t("vendor"), key: "vendor", width: 20 },
        { header: t("cycle"), key: "cycle", width: 14 },
        { header: t("amount"), key: "amount_num", kind: "money" as const, width: 16 },
        { header: t("nextRenewal"), key: "next", kind: "date" as const, width: 16 },
        { header: t("status"), key: "status", width: 14 },
      ],
      xlsxRows: list.map((s) => ({
        name: s.name,
        vendor: s.vendor ?? "",
        cycle: t(subscriptionCycleKey(s.cycle)),
        amount_num: Number(s.amount),
        next: new Date(s.next_renewal_date),
        status: s.status,
      })),
      settings: settings ?? null,
      lang,
      currency,
    };
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <ExportMenu
          onExportPdf={() => exportFinanceListPdf(buildExport())}
          onExportXlsx={() => exportFinanceListXlsx(buildExport())}
          disabled={(rows ?? []).length === 0}
        />
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
          <Plus size={16} /> {t("newSubscription")}
        </button>
      </div>


      {(rows ?? []).length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noSubscriptions")}</div>
      ) : (
        <div className="brand-card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", background: "var(--surface-2)" }}>
                <th style={th}>{t("planName")}</th>
                <th style={th}>{t("vendor")}</th>
                <th style={th}>{t("cycle")}</th>
                <th style={{ ...th, textAlign: "end" }}>{t("amount")}</th>
                <th style={th}>{t("nextRenewal")}</th>
                <th style={th}>{t("status")}</th>
                <th style={{ ...th, width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((s) => {
                const daysLeft = Math.floor((new Date(s.next_renewal_date).getTime() - Date.now()) / 86400000);
                const dueSoon = s.status === "active" && daysLeft <= s.reminder_days;
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}><div style={{ fontWeight: 600 }}>{s.name}</div>{s.category && <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.category}</div>}</td>
                    <td style={td}>{s.vendor ?? "—"}</td>
                    <td style={td}>{t(subscriptionCycleKey(s.cycle))}</td>
                    <td style={{ ...td, textAlign: "end", fontWeight: 600 }}>{formatMoney(s.amount, s.currency, lang)}</td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {formatDate(s.next_renewal_date, lang)}
                        {dueSoon && <AlertTriangle size={12} color="#FBBF24" />}
                      </div>
                      {dueSoon && <div style={{ fontSize: 10, color: "#FBBF24" }}>{t("subscriptionDueSoon")} · {daysLeft}d</div>}
                    </td>
                    <td style={td}><StatusPill status={s.status} /></td>
                    <td style={{ ...td, textAlign: "end" }}>
                      {s.status === "active" && s.next_renewal_date <= today && (
                        <button onClick={() => renew(s)} className="brand-btn-sm" style={{ background: "rgba(80,200,120,.15)", color: "#50C878", border: "1px solid rgba(80,200,120,.35)", padding: "6px 8px", marginInlineEnd: 4 }} title={t("renewNow")}>
                          <RefreshCw size={12} />
                        </button>
                      )}
                      <button onClick={() => { setEditing(s); setShowModal(true); }} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px", marginInlineEnd: 4 }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => remove(s)} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)", padding: "6px 8px" }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ExpenseSubModal sub={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ["subscriptions_expense"] }); }} />}
    </div>
  );
}

function IncomeSubs() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SubscriptionIncome | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: rows } = useQuery({
    queryKey: ["subscriptions_income"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions_income").select("*").order("next_invoice_date");
      if (error) throw error;
      return (data ?? []) as SubscriptionIncome[];
    },
  });
  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("name_en");
      return (data ?? []) as Customer[];
    },
  });
  const custMap = useMemo(() => {
    const m = new Map<string, Customer>();
    (customers ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customers]);

  const remove = async (s: SubscriptionIncome) => {
    if (!(await confirm({ message: t("confirmDeleteSubscription"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("subscriptions_income").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["subscriptions_income"] });
  };

  const renew = async (s: SubscriptionIncome) => {
    // Create draft invoice
    const { data: settings } = await supabase.from("financial_settings").select("default_tax_rate, invoice_terms_ar, invoice_terms_en").maybeSingle();
    const { data: invNumRes, error: numErr } = await supabase.rpc("next_invoice_number");
    if (numErr) { toast.error(numErr.message); return; }
    const taxRate = Number(settings?.default_tax_rate ?? 0);
    const amount = Number(s.amount);
    const taxAmount = (amount * taxRate) / 100;
    const total = amount + taxAmount;
    const { data: inv, error: invErr } = await supabase.from("invoices").insert({
      number: invNumRes as unknown as string,
      customer_id: s.customer_id,
      issue_date: s.next_invoice_date,
      due_date: s.next_invoice_date,
      currency: s.currency,
      subtotal: amount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_amount: 0,
      total,
      status: "issued",
      terms_ar: settings?.invoice_terms_ar ?? null,
      terms_en: settings?.invoice_terms_en ?? null,
      notes_en: `Subscription: ${s.plan_name}`,
    }).select("id").single();
    if (invErr) { toast.error(invErr.message); return; }

    await supabase.from("invoice_items").insert({
      invoice_id: inv!.id,
      description_en: s.plan_name,
      description_ar: s.plan_name,
      quantity: 1,
      unit_price: amount,
      discount_amount: 0,
      line_total: amount,
      sort_order: 0,
    });

    const { data: nextData } = await supabase.rpc("advance_subscription_date", { base_date: s.next_invoice_date, c: s.cycle });
    const next = nextData as unknown as string;
    await supabase.from("subscriptions_income").update({ next_invoice_date: next }).eq("id", s.id);
    toast.success(t("renewedCreatedInvoice"));
    qc.invalidateQueries({ queryKey: ["subscriptions_income"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const today = new Date().toISOString().slice(0, 10);

  const { data: settings } = useFinancialSettings();
  const buildExport = () => {
    const ar = lang === "ar";
    const list = rows ?? [];
    const currency = (list[0]?.currency ?? "SYP") as string;
    return {
      slug: "subscriptions-income",
      title: t("subscriptionsIncome"),
      subtitle: ar ? "الاشتراكات — دخل" : "Income subscriptions",
      rangeLabel: `${list.length} ${ar ? "اشتراك" : "subscriptions"}`,
      kpis: [
        { label: ar ? "العدد" : "Count", value: String(list.length), tone: "blue" as const },
        { label: ar ? "المجموع الشهري" : "Monthly total", value: formatMoney(list.filter((s) => s.cycle === "monthly").reduce((a, s) => a + Number(s.amount), 0), currency as never, lang), tone: "green" as const },
      ],
      columns: [
        { header: t("customer"), key: "customer", bold: true },
        { header: t("planName"), key: "plan" },
        { header: t("cycle"), key: "cycle" },
        { header: t("amount"), key: "amount", align: "end" as const, tone: () => "green" as const },
        { header: ar ? "الفاتورة القادمة" : "Next invoice", key: "next" },
        { header: t("status"), key: "status" },
      ],
      rows: list.map((s) => {
        const c = custMap.get(s.customer_id);
        return {
          customer: c ? (ar ? c.name_ar || c.name_en : c.name_en || c.name_ar) : "—",
          plan: s.plan_name,
          cycle: t(subscriptionCycleKey(s.cycle)),
          amount: formatMoney(s.amount, s.currency, lang),
          next: formatDate(s.next_invoice_date, lang),
          status: s.status,
        };
      }),
      xlsxColumns: [
        { header: t("customer"), key: "customer", width: 24 },
        { header: t("planName"), key: "plan", width: 22 },
        { header: t("cycle"), key: "cycle", width: 14 },
        { header: t("amount"), key: "amount_num", kind: "money" as const, width: 16 },
        { header: ar ? "الفاتورة القادمة" : "Next invoice", key: "next", kind: "date" as const, width: 16 },
        { header: t("status"), key: "status", width: 14 },
      ],
      xlsxRows: list.map((s) => {
        const c = custMap.get(s.customer_id);
        return {
          customer: c ? (ar ? c.name_ar || c.name_en : c.name_en || c.name_ar) : "",
          plan: s.plan_name,
          cycle: t(subscriptionCycleKey(s.cycle)),
          amount_num: Number(s.amount),
          next: new Date(s.next_invoice_date),
          status: s.status,
        };
      }),
      settings: settings ?? null,
      lang,
      currency,
    };
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <ExportMenu
          onExportPdf={() => exportFinanceListPdf(buildExport())}
          onExportXlsx={() => exportFinanceListXlsx(buildExport())}
          disabled={(rows ?? []).length === 0}
        />

        <button onClick={() => { setEditing(null); setShowModal(true); }} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
          <Plus size={16} /> {t("newSubscription")}
        </button>
      </div>

      {(rows ?? []).length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noSubscriptions")}</div>
      ) : (
        <div className="brand-card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", background: "var(--surface-2)" }}>
                <th style={th}>{t("planName")}</th>
                <th style={th}>{t("customer")}</th>
                <th style={th}>{t("cycle")}</th>
                <th style={{ ...th, textAlign: "end" }}>{t("amount")}</th>
                <th style={th}>{t("nextInvoiceDate")}</th>
                <th style={th}>{t("status")}</th>
                <th style={{ ...th, width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((s) => {
                const c = custMap.get(s.customer_id);
                const daysLeft = Math.floor((new Date(s.next_invoice_date).getTime() - Date.now()) / 86400000);
                const dueSoon = s.status === "active" && daysLeft <= s.reminder_days;
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}><div style={{ fontWeight: 600 }}>{s.plan_name}</div>{s.description && <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.description}</div>}</td>
                    <td style={td}>{c ? (lang === "ar" ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)) : "—"}</td>
                    <td style={td}>{t(subscriptionCycleKey(s.cycle))}</td>
                    <td style={{ ...td, textAlign: "end", fontWeight: 600, color: "#50C878" }}>{formatMoney(s.amount, s.currency, lang)}</td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {formatDate(s.next_invoice_date, lang)}
                        {dueSoon && <AlertTriangle size={12} color="#FBBF24" />}
                      </div>
                      {dueSoon && <div style={{ fontSize: 10, color: "#FBBF24" }}>{t("subscriptionDueSoon")} · {daysLeft}d</div>}
                    </td>
                    <td style={td}><StatusPill status={s.status} /></td>
                    <td style={{ ...td, textAlign: "end" }}>
                      {s.status === "active" && s.next_invoice_date <= today && (
                        <button onClick={() => renew(s)} className="brand-btn-sm" style={{ background: "rgba(80,200,120,.15)", color: "#50C878", border: "1px solid rgba(80,200,120,.35)", padding: "6px 8px", marginInlineEnd: 4 }} title={t("renewNow")}>
                          <RefreshCw size={12} />
                        </button>
                      )}
                      <button onClick={() => { setEditing(s); setShowModal(true); }} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px", marginInlineEnd: 4 }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => remove(s)} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)", padding: "6px 8px" }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <IncomeSubModal
          sub={editing}
          customers={customers ?? []}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ["subscriptions_income"] }); }}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SubscriptionStatus }) {
  const { t } = useApp();
  const map: Record<SubscriptionStatus, { bg: string; fg: string; label: "subStatusActive" | "subStatusPaused" | "subStatusCanceled" }> = {
    active: { bg: "rgba(80,200,120,.15)", fg: "#50C878", label: "subStatusActive" },
    paused: { bg: "rgba(245,158,11,.15)", fg: "#FBBF24", label: "subStatusPaused" },
    canceled: { bg: "rgba(107,114,128,.15)", fg: "#9CA3AF", label: "subStatusCanceled" },
  };
  const s = map[status];
  return <span style={{ padding: "3px 10px", borderRadius: 12, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700 }}>{t(s.label)}</span>;
}

function ExpenseSubModal({ sub, onClose, onSaved }: { sub: SubscriptionExpense | null; onClose: () => void; onSaved: () => void }) {
  const { t, user } = useApp();
  const [form, setForm] = useState({
    name: sub?.name ?? "",
    vendor: sub?.vendor ?? "",
    category: sub?.category ?? "",
    cycle: (sub?.cycle ?? "monthly") as SubscriptionCycle,
    amount: sub ? Number(sub.amount) : 0,
    currency: (sub?.currency ?? "USD") as Currency,
    start_date: sub?.start_date ?? new Date().toISOString().slice(0, 10),
    next_renewal_date: sub?.next_renewal_date ?? new Date().toISOString().slice(0, 10),
    reminder_days: sub?.reminder_days ?? 7,
    status: (sub?.status ?? "active") as SubscriptionStatus,
    notes: sub?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name || form.amount <= 0) { toast.error("Required"); return; }
    setSaving(true);
    const payload = { ...form, vendor: form.vendor || null, category: form.category || null, notes: form.notes || null };
    const { error } = sub
      ? await supabase.from("subscriptions_expense").update(payload).eq("id", sub.id)
      : await supabase.from("subscriptions_expense").insert({ ...payload, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    onSaved();
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{sub ? t("subscriptions") : t("newSubscription")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <Field label={t("planName")}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={t("vendor")}><input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} style={inp} /></Field>
            <Field label={t("category")}><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <Field label={t("amount")}><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label={t("currency")}>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })} style={inp}>
                <option value="SYP">SYP</option><option value="USD">USD</option>
              </select>
            </Field>
            <Field label={t("cycle")}>
              <select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as SubscriptionCycle })} style={inp}>
                <option value="monthly">{t("cycleMonthly")}</option>
                <option value="quarterly">{t("cycleQuarterly")}</option>
                <option value="semiannual">{t("cycleSemiannual")}</option>
                <option value="annual">{t("cycleAnnual")}</option>
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label={t("expenseDate")}><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inp} /></Field>
            <Field label={t("nextRenewal")}><input type="date" value={form.next_renewal_date} onChange={(e) => setForm({ ...form, next_renewal_date: e.target.value })} style={inp} /></Field>
            <Field label={t("reminderDays")}><input type="number" value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: parseInt(e.target.value) || 0 })} style={inp} /></Field>
          </div>
          <Field label={t("status")}>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SubscriptionStatus })} style={inp}>
              <option value="active">{t("subStatusActive")}</option>
              <option value="paused">{t("subStatusPaused")}</option>
              <option value="canceled">{t("subStatusCanceled")}</option>
            </select>
          </Field>
          <Field label={t("notesEnglish")}><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
          <button onClick={save} disabled={saving} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", opacity: saving ? 0.6 : 1 }}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

function IncomeSubModal({ sub, customers, onClose, onSaved }: { sub: SubscriptionIncome | null; customers: Customer[]; onClose: () => void; onSaved: () => void }) {
  const { t, user, lang } = useApp();
  const [form, setForm] = useState({
    customer_id: sub?.customer_id ?? (customers[0]?.id ?? ""),
    plan_name: sub?.plan_name ?? "",
    description: sub?.description ?? "",
    cycle: (sub?.cycle ?? "monthly") as SubscriptionCycle,
    amount: sub ? Number(sub.amount) : 0,
    currency: (sub?.currency ?? "USD") as Currency,
    start_date: sub?.start_date ?? new Date().toISOString().slice(0, 10),
    next_invoice_date: sub?.next_invoice_date ?? new Date().toISOString().slice(0, 10),
    reminder_days: sub?.reminder_days ?? 7,
    status: (sub?.status ?? "active") as SubscriptionStatus,
    notes: sub?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.customer_id || !form.plan_name || form.amount <= 0) { toast.error(t("planName")); return; }
    setSaving(true);
    const payload = { ...form, description: form.description || null, notes: form.notes || null };
    const { error } = sub
      ? await supabase.from("subscriptions_income").update(payload).eq("id", sub.id)
      : await supabase.from("subscriptions_income").insert({ ...payload, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    onSaved();
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{sub ? t("subscriptions") : t("newSubscription")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <Field label={t("customer")}>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} style={inp}>
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{lang === "ar" ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("planName")}><input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} style={inp} /></Field>
          <Field label={t("description")}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <Field label={t("amount")}><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label={t("currency")}>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })} style={inp}>
                <option value="SYP">SYP</option><option value="USD">USD</option>
              </select>
            </Field>
            <Field label={t("cycle")}>
              <select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as SubscriptionCycle })} style={inp}>
                <option value="monthly">{t("cycleMonthly")}</option>
                <option value="quarterly">{t("cycleQuarterly")}</option>
                <option value="semiannual">{t("cycleSemiannual")}</option>
                <option value="annual">{t("cycleAnnual")}</option>
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label={t("expenseDate")}><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inp} /></Field>
            <Field label={t("nextInvoiceDate")}><input type="date" value={form.next_invoice_date} onChange={(e) => setForm({ ...form, next_invoice_date: e.target.value })} style={inp} /></Field>
            <Field label={t("reminderDays")}><input type="number" value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: parseInt(e.target.value) || 0 })} style={inp} /></Field>
          </div>
          <Field label={t("status")}>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SubscriptionStatus })} style={inp}>
              <option value="active">{t("subStatusActive")}</option>
              <option value="paused">{t("subStatusPaused")}</option>
              <option value="canceled">{t("subStatusCanceled")}</option>
            </select>
          </Field>
          <Field label={t("notesEnglish")}><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
          <button onClick={save} disabled={saving} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", opacity: saving ? 0.6 : 1 }}>{t("save")}</button>
        </div>
      </div>
    </div>
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
const inp: React.CSSProperties = { padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 14, width: "100%" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "start", fontSize: 11, fontWeight: 700, textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "12px", verticalAlign: "middle" };
