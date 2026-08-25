import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/security/db";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Search, Paperclip, Download } from "lucide-react";
import { formatMoney, fxRates, rateToUsd, paymentMethodKey, type Expense, type ExpenseCategory, type Currency, type PaymentMethod, type ExpenseStatus, type FxRate } from "@/lib/finance";
import { PaymentMethodSelect } from "@/components/finance/PaymentMethodSelect";
import { formatDate } from "@/lib/format";
import { useConfirm } from "@/components/confirm-dialog";
import { ExportMenu } from "@/components/finance/ExportMenu";
import { exportFinanceListPdf, exportFinanceListXlsx } from "@/lib/finance-list-export";
import { useFinancialSettings } from "@/lib/finance-hooks";

export const Route = createFileRoute("/_authenticated/finance/expenses")({
  component: ExpensesPage,
});


function ExpensesPage() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["expense_categories"],
    queryFn: async () => {
      const { data } = await supabase.from("expense_categories").select("*").order("sort_order");
      return (data ?? []) as ExpenseCategory[];
    },
  });

  const catMap = useMemo(() => {
    const m = new Map<string, ExpenseCategory>();
    (categories ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (expenses ?? []).filter((e) => {
      if (catFilter !== "all" && e.category_id !== catFilter) return false;
      if (!term) return true;
      return [e.description_ar, e.description_en, e.vendor, e.reference]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [expenses, catFilter, q]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  const remove = async (e: Expense) => {
    if (!(await confirm({ message: t("confirmDeleteExpense"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };

  const downloadReceipt = async (e: Expense) => {
    if (!e.receipt_path) return;
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(e.receipt_path, 300);
    if (error || !data) { toast.error(error?.message ?? "err"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const { data: settings } = useFinancialSettings();

  const buildExport = () => {
    const ar = lang === "ar";
    const currency = (filtered[0]?.currency ?? "SYP") as string;
    return {
      slug: "expenses",
      title: t("expenses"),
      subtitle: ar ? "قائمة المصاريف" : "Expenses list",
      rangeLabel: `${filtered.length} ${ar ? "قيد" : "entries"}`,
      kpis: [
        { label: ar ? "الإجمالي" : "Total", value: formatMoney(total, (filtered[0]?.currency ?? "SYP") as Currency, lang), tone: "red" as const },
        { label: ar ? "عدد القيود" : "Entries", value: String(filtered.length), tone: "blue" as const },
      ],
      columns: [
        { header: t("expenseDate"), key: "date" },
        { header: t("category"), key: "category" },
        { header: t("vendor"), key: "vendor" },
        { header: t("description"), key: "description" },
        { header: t("paymentMethod"), key: "method" },
        { header: t("amount"), key: "amount", align: "end" as const, bold: true, tone: () => "red" as const },
      ],
      rows: filtered.map((e) => {
        const cat = e.category_id ? catMap.get(e.category_id) : undefined;
        return {
          date: formatDate(e.expense_date, lang),
          category: cat ? (ar ? cat.name_ar : cat.name_en) : "—",
          vendor: e.vendor ?? "—",
          description: (ar ? e.description_ar || e.description_en : e.description_en || e.description_ar) ?? "—",
          method: t(paymentMethodKey(e.method)),
          amount: formatMoney(e.amount, e.currency, lang),
        };
      }),
      totalsPdf: [{ label: ar ? "الإجمالي" : "Total", value: formatMoney(total, (filtered[0]?.currency ?? "SYP") as Currency, lang), tone: "red" as const }],
      xlsxColumns: [
        { header: t("expenseDate"), key: "date", kind: "date" as const, width: 14 },
        { header: t("category"), key: "category", width: 20 },
        { header: t("vendor"), key: "vendor", width: 20 },
        { header: t("description"), key: "description", width: 32 },
        { header: t("paymentMethod"), key: "method", width: 18 },
        { header: t("amount"), key: "amount_num", kind: "money" as const, width: 18 },
      ],
      xlsxRows: filtered.map((e) => {
        const cat = e.category_id ? catMap.get(e.category_id) : undefined;
        return {
          date: new Date(e.expense_date),
          category: cat ? (ar ? cat.name_ar : cat.name_en) : "",
          vendor: e.vendor ?? "",
          description: (ar ? e.description_ar || e.description_en : e.description_en || e.description_ar) ?? "",
          method: t(paymentMethodKey(e.method)),
          amount_num: Number(e.amount),
        };
      }),
      totalsXlsx: { description: ar ? "الإجمالي" : "Total", amount_num: total },
      settings: settings ?? null,
      lang,
      currency,
    };
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>{t("expenses")}</h1>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchExpenses")}
            style={{ width: "100%", padding: "10px 14px 10px 36px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 13 }}
          />
        </div>
        <ExportMenu
          onExportPdf={() => exportFinanceListPdf(buildExport())}
          onExportXlsx={() => exportFinanceListXlsx(buildExport())}
          disabled={filtered.length === 0}
        />
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="brand-btn"
          style={{ background: "var(--grad-blue)", color: "#fff" }}
        >
          <Plus size={16} /> {t("newExpense")}
        </button>

      </div>

      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "4px 0" }}>
        <button onClick={() => setCatFilter("all")} className="brand-btn-sm" style={{ background: catFilter === "all" ? "var(--grad-blue)" : "var(--surface-2)", color: catFilter === "all" ? "#fff" : "var(--foreground)", border: "1px solid var(--border)", whiteSpace: "nowrap" }}>
          {t("filterAll")}
        </button>
        {categories?.filter((c) => c.active).map((c) => (
          <button key={c.id} onClick={() => setCatFilter(c.id)} className="brand-btn-sm" style={{ background: catFilter === c.id ? (c.color ?? "var(--grad-blue)") : "var(--surface-2)", color: catFilter === c.id ? "#fff" : "var(--foreground)", border: "1px solid var(--border)", whiteSpace: "nowrap" }}>
            {lang === "ar" ? c.name_ar : c.name_en}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noExpenses")}</div>
      ) : (
        <>
          <div className="brand-card table-scroll" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", background: "var(--surface-2)" }}>
                  <th style={th}>{t("expenseDate")}</th>
                  <th style={th}>{t("category")}</th>
                  <th style={th}>{t("vendor")}</th>
                  <th style={th}>{t("description")}</th>
                  <th style={th}>{t("paymentMethod")}</th>
                  <th style={{ ...th, textAlign: "end" }}>{t("amount")}</th>
                  <th style={{ ...th, width: 130 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const cat = e.category_id ? catMap.get(e.category_id) : undefined;
                  return (
                    <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={td}>{formatDate(e.expense_date, lang)}</td>
                      <td style={td}>
                        {cat && (
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: (cat.color ?? "#6B7280") + "22", color: cat.color ?? "#6B7280", fontSize: 12, fontWeight: 600 }}>
                            {lang === "ar" ? cat.name_ar : cat.name_en}
                          </span>
                        )}
                      </td>
                      <td style={td}>{e.vendor ?? "—"}</td>
                      <td style={td}>{lang === "ar" ? (e.description_ar || e.description_en) : (e.description_en || e.description_ar)}</td>
                      <td style={td}>{t(paymentMethodKey(e.method))}</td>
                      <td style={{ ...td, textAlign: "end", fontWeight: 600, color: "#F0676A" }}>{formatMoney(e.amount, e.currency, lang)}</td>
                      <td style={{ ...td, textAlign: "end" }}>
                        {e.receipt_path && (
                          <button onClick={() => downloadReceipt(e)} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px", marginInlineEnd: 4 }}>
                            <Download size={12} />
                          </button>
                        )}
                        <button onClick={() => { setEditing(e); setShowModal(true); }} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px", marginInlineEnd: 4 }}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => remove(e)} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)", padding: "6px 8px" }}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "end", fontSize: 13, color: "var(--muted)", padding: "0 12px" }}>
            {filtered.length} · <span style={{ fontWeight: 700, color: "var(--foreground)" }}>{formatMoney(total, filtered[0]?.currency ?? "SYP", lang)}</span>
          </div>
        </>
      )}

      {showModal && (
        <ExpenseModal
          expense={editing}
          categories={categories ?? []}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ["expenses"] }); }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ expense, categories, onClose, onSaved }: { expense: Expense | null; categories: ExpenseCategory[]; onClose: () => void; onSaved: () => void }) {
  const { t, lang, user } = useApp();

  const { data: latestFx } = useQuery({
    queryKey: ["fx_rates", "latest"],
    queryFn: async () => {
      const { data } = await supabase.from("fx_rates").select("*").order("effective_date", { ascending: false }).limit(1).maybeSingle();
      return data as FxRate | null;
    },
  });

  const [form, setForm] = useState({
    expense_date: expense?.expense_date ?? new Date().toISOString().slice(0, 10),
    category_id: expense?.category_id ?? "",
    vendor: expense?.vendor ?? "",
    description_ar: expense?.description_ar ?? "",
    description_en: expense?.description_en ?? "",
    amount: expense ? Number(expense.amount) : 0,
    currency: (expense?.currency ?? "SYP") as Currency,
    method: (expense?.method ?? "cash") as PaymentMethod,
    status: (expense?.status ?? "paid") as ExpenseStatus,
    reference: expense?.reference ?? "",
    notes: expense?.notes ?? "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (form.amount <= 0) { toast.error(t("amount")); return; }
    if (!form.description_ar && !form.description_en) { toast.error(t("description")); return; }
    setSaving(true);
    try {
      let receipt_path: string | null | undefined = undefined; // undefined = keep, null = clear
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop() ?? "bin";
        const path = `${user?.id ?? "u"}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("expense-receipts").upload(path, receiptFile, { upsert: false });
        if (upErr) throw upErr;
        receipt_path = path;
      }
      const rate = latestFx ? rateToUsd(form.currency, fxRates(latestFx)) : null;
      const payload = {
        ...form,
        category_id: form.category_id || null,
        vendor: form.vendor || null,
        description_ar: form.description_ar || null,
        description_en: form.description_en || null,
        reference: form.reference || null,
        notes: form.notes || null,
        exchange_rate_to_usd: rate,
        ...(receipt_path !== undefined ? { receipt_path } : {}),
      };
      const { error } = expense
        ? await supabase.from("expenses").update(payload).eq("id", expense.id)
        : await supabase.from("expenses").insert({ ...payload, created_by: user?.id });
      if (error) throw error;
      toast.success(t("saved"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{expense ? t("expenses") : t("newExpense")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={t("expenseDate")}><input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} style={inp} /></Field>
            <Field label={t("category")}>
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} style={inp}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("vendor")}><input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} style={inp} /></Field>
          <Field label={lang === "ar" ? "الوصف (عربي)" : "Description (Arabic)"}><input value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} style={inp} /></Field>
          <Field label={lang === "ar" ? "الوصف (إنجليزي)" : "Description (English)"}><input value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <Field label={t("amount")}><input type="number" step="0.01" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label={t("currency")}>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })} style={inp}>
                <option value="SYP">SYP</option>
                <option value="USD">USD</option>
                <option value="SAR">SAR</option>
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={t("paymentMethod")}>
              <PaymentMethodSelect value={form.method} onChange={(m) => setForm({ ...form, method: m })} />
            </Field>
            <Field label={t("status")}>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExpenseStatus })} style={inp}>
                <option value="paid">{t("invoicePaid")}</option>
                <option value="pending">{lang === "ar" ? "معلّق" : "Pending"}</option>
                <option value="cancelled">{lang === "ar" ? "ملغى" : "Cancelled"}</option>
              </select>
            </Field>
          </div>
          <Field label={t("reference")}><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={inp} /></Field>
          <Field label={t("receipt")}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 10, cursor: "pointer" }}>
              <Paperclip size={14} />
              <span style={{ fontSize: 13, flex: 1 }}>{receiptFile ? receiptFile.name : (expense?.receipt_path ? (lang === "ar" ? "استبدال الإيصال" : "Replace receipt") : (lang === "ar" ? "رفع إيصال" : "Upload receipt"))}</span>
              <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
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

const inp: React.CSSProperties = {
  padding: "10px 12px",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--foreground)",
  fontSize: 14,
  width: "100%",
};
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "start", fontSize: 11, fontWeight: 700, textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "12px", verticalAlign: "middle" };
