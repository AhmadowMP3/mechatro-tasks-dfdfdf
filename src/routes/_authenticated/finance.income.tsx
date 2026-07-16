import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { formatMoney, paymentMethodKey, type IncomeEntry, type Currency, type PaymentMethod, type FxRate } from "@/lib/finance";
import { PaymentMethodSelect } from "@/components/finance/PaymentMethodSelect";
import { formatDate } from "@/lib/format";
import { useConfirm } from "@/components/confirm-dialog";
import { ExportMenu } from "@/components/finance/ExportMenu";
import { exportFinanceListPdf, exportFinanceListXlsx } from "@/lib/finance-list-export";
import { useFinancialSettings } from "@/lib/finance-hooks";

export const Route = createFileRoute("/_authenticated/finance/income")({
  component: IncomePage,
});


function IncomePage() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<IncomeEntry | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { data: settings } = useFinancialSettings();

  const { data: entries } = useQuery({
    queryKey: ["income_entries"],

    queryFn: async () => {
      const { data, error } = await supabase.from("income_entries").select("*").order("income_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IncomeEntry[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (entries ?? []).filter((e) => {
      if (!term) return true;
      return [e.category, e.source, e.description_ar, e.description_en, e.reference]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [entries, q]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  const remove = async (e: IncomeEntry) => {
    if (!(await confirm({ message: t("confirmDeleteIncome"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("income_entries").delete().eq("id", e.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["income_entries"] });
  };

  const buildExport = () => {
    const ar = lang === "ar";
    const currency = (filtered[0]?.currency ?? "SYP") as string;
    return {
      slug: "income",
      title: t("income"),
      subtitle: ar ? "قائمة الدخل" : "Income entries",
      rangeLabel: `${filtered.length} ${ar ? "قيد" : "entries"}`,
      kpis: [
        { label: ar ? "الإجمالي" : "Total", value: formatMoney(total, (filtered[0]?.currency ?? "SYP") as Currency, lang), tone: "green" as const },
        { label: ar ? "عدد القيود" : "Entries", value: String(filtered.length), tone: "blue" as const },
      ],
      columns: [
        { header: t("expenseDate"), key: "date" },
        { header: t("category"), key: "category" },
        { header: t("source"), key: "source" },
        { header: t("description"), key: "description" },
        { header: t("paymentMethod"), key: "method" },
        { header: t("amount"), key: "amount", align: "end" as const, bold: true, tone: () => "green" as const },
      ],
      rows: filtered.map((e) => ({
        date: formatDate(e.income_date, lang),
        category: e.category ?? "—",
        source: e.source ?? "—",
        description: (ar ? e.description_ar || e.description_en : e.description_en || e.description_ar) ?? "—",
        method: t(paymentMethodKey(e.method)),
        amount: formatMoney(e.amount, e.currency, lang),
      })),
      totalsPdf: [{ label: ar ? "الإجمالي" : "Total", value: formatMoney(total, (filtered[0]?.currency ?? "SYP") as Currency, lang), tone: "green" as const }],
      xlsxColumns: [
        { header: t("expenseDate"), key: "date", kind: "date" as const, width: 14 },
        { header: t("category"), key: "category", width: 20 },
        { header: t("source"), key: "source", width: 20 },
        { header: t("description"), key: "description", width: 32 },
        { header: t("paymentMethod"), key: "method", width: 18 },
        { header: t("amount"), key: "amount_num", kind: "money" as const, width: 18 },
      ],
      xlsxRows: filtered.map((e) => ({
        date: new Date(e.income_date),
        category: e.category ?? "",
        source: e.source ?? "",
        description: (ar ? e.description_ar || e.description_en : e.description_en || e.description_ar) ?? "",
        method: t(paymentMethodKey(e.method)),
        amount_num: Number(e.amount),
      })),
      totalsXlsx: { description: ar ? "الإجمالي" : "Total", amount_num: total },
      settings: settings ?? null,
      lang,
      currency,
    };
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>{t("income")}</h1>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "ar" ? "بحث في الدخل" : "Search income"} style={{ width: "100%", padding: "10px 14px 10px 36px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 13 }} />
        </div>
        <ExportMenu
          onExportPdf={() => exportFinanceListPdf(buildExport())}
          onExportXlsx={() => exportFinanceListXlsx(buildExport())}
          disabled={filtered.length === 0}
        />
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
          <Plus size={16} /> {t("newIncome")}
        </button>

      </div>

      <div style={{ fontSize: 13, color: "var(--muted)", padding: "0 4px" }}>
        {lang === "ar"
          ? "الدخل من الفواتير يظهر تلقائياً في اللوحة المالية. هنا فقط للدخل المباشر (بدون فاتورة)."
          : "Invoice-based income appears automatically on the dashboard. This page is for direct income only (no invoice)."}
      </div>

      {filtered.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noIncome")}</div>
      ) : (
        <>
          <div className="brand-card" style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", background: "var(--surface-2)" }}>
                  <th style={th}>{t("expenseDate")}</th>
                  <th style={th}>{t("category")}</th>
                  <th style={th}>{t("source")}</th>
                  <th style={th}>{t("description")}</th>
                  <th style={th}>{t("paymentMethod")}</th>
                  <th style={{ ...th, textAlign: "end" }}>{t("amount")}</th>
                  <th style={{ ...th, width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>{formatDate(e.income_date, lang)}</td>
                    <td style={td}>{e.category ?? "—"}</td>
                    <td style={td}>{e.source ?? "—"}</td>
                    <td style={td}>{lang === "ar" ? (e.description_ar || e.description_en) : (e.description_en || e.description_ar)}</td>
                    <td style={td}>{t(paymentMethodKey(e.method))}</td>
                    <td style={{ ...td, textAlign: "end", fontWeight: 600, color: "#50C878" }}>{formatMoney(e.amount, e.currency, lang)}</td>
                    <td style={{ ...td, textAlign: "end" }}>
                      <button onClick={() => { setEditing(e); setShowModal(true); }} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px", marginInlineEnd: 4 }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => remove(e)} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)", padding: "6px 8px" }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "end", fontSize: 13, color: "var(--muted)", padding: "0 12px" }}>
            {filtered.length} · <span style={{ fontWeight: 700, color: "#50C878" }}>{formatMoney(total, filtered[0]?.currency ?? "SYP", lang)}</span>
          </div>
        </>
      )}

      {showModal && (
        <IncomeModal
          entry={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ["income_entries"] }); }}
        />
      )}
    </div>
  );
}

function IncomeModal({ entry, onClose, onSaved }: { entry: IncomeEntry | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang, user } = useApp();
  const { data: latestFx } = useQuery({
    queryKey: ["fx_rates", "latest"],
    queryFn: async () => {
      const { data } = await supabase.from("fx_rates").select("*").order("effective_date", { ascending: false }).limit(1).maybeSingle();
      return data as FxRate | null;
    },
  });

  const [form, setForm] = useState({
    income_date: entry?.income_date ?? new Date().toISOString().slice(0, 10),
    category: entry?.category ?? "",
    source: entry?.source ?? "",
    description_ar: entry?.description_ar ?? "",
    description_en: entry?.description_en ?? "",
    amount: entry ? Number(entry.amount) : 0,
    currency: (entry?.currency ?? "SYP") as Currency,
    method: (entry?.method ?? "bank_transfer") as PaymentMethod,
    reference: entry?.reference ?? "",
    notes: entry?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (form.amount <= 0) { toast.error(t("amount")); return; }
    if (!form.description_ar && !form.description_en) { toast.error(t("description")); return; }
    setSaving(true);
    const rate = latestFx ? Number(latestFx.syp_per_usd) : null;
    const payload = {
      ...form,
      category: form.category || null,
      source: form.source || null,
      description_ar: form.description_ar || null,
      description_en: form.description_en || null,
      reference: form.reference || null,
      notes: form.notes || null,
      exchange_rate_to_usd: rate,
    };
    const { error } = entry
      ? await supabase.from("income_entries").update(payload).eq("id", entry.id)
      : await supabase.from("income_entries").insert({ ...payload, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{entry ? t("income") : t("newIncome")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={t("expenseDate")}><input type="date" value={form.income_date} onChange={(e) => setForm({ ...form, income_date: e.target.value })} style={inp} /></Field>
            <Field label={t("category")}><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={lang === "ar" ? "استشارة، بيع، ..." : "Consulting, sale, ..."} style={inp} /></Field>
          </div>
          <Field label={t("source")}><input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={inp} /></Field>
          <Field label={lang === "ar" ? "الوصف (عربي)" : "Description (Arabic)"}><input value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} style={inp} /></Field>
          <Field label={lang === "ar" ? "الوصف (إنجليزي)" : "Description (English)"}><input value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <Field label={t("amount")}><input type="number" step="0.01" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label={t("currency")}>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })} style={inp}>
                <option value="SYP">SYP</option>
                <option value="USD">USD</option>
              </select>
            </Field>
          </div>
          <Field label={t("paymentMethod")}>
            <PaymentMethodSelect value={form.method} onChange={(m) => setForm({ ...form, method: m })} />
          </Field>
          <Field label={t("reference")}><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={inp} /></Field>
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
