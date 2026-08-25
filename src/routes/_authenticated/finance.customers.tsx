import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/security/db";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, Mail, Phone, Search } from "lucide-react";
import type { Customer, Currency } from "@/lib/finance";
import { useConfirm } from "@/components/confirm-dialog";
import { ExportMenu } from "@/components/finance/ExportMenu";
import { exportFinanceListPdf, exportFinanceListXlsx } from "@/lib/finance-list-export";
import { useFinancialSettings } from "@/lib/finance-hooks";

export const Route = createFileRoute("/_authenticated/finance/customers")({
  component: CustomersPage,
});


function CustomersPage() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return customers ?? [];
    return (customers ?? []).filter((c) =>
      [c.name_ar, c.name_en, c.company, c.email, c.phone, c.tax_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [customers, q]);

  const remove = async (c: Customer) => {
    if (!(await confirm({ message: t("confirmDeleteCustomer"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  const { data: settings } = useFinancialSettings();
  const buildExport = () => {
    const ar = lang === "ar";
    return {
      slug: "customers",
      title: t("customers"),
      subtitle: ar ? "قائمة العملاء" : "Customers list",
      rangeLabel: `${filtered.length} ${ar ? "عميل" : "customers"}`,
      kpis: [
        { label: ar ? "إجمالي العملاء" : "Total", value: String(filtered.length), tone: "blue" as const },
      ],
      columns: [
        { header: ar ? "الاسم" : "Name", key: "name", bold: true },
        { header: ar ? "الشركة" : "Company", key: "company" },
        { header: t("email"), key: "email" },
        { header: t("phone"), key: "phone" },
        { header: ar ? "رقم ضريبي" : "Tax #", key: "tax" },
      ],
      rows: filtered.map((c) => ({
        name: (ar ? c.name_ar || c.name_en : c.name_en || c.name_ar) ?? "—",
        company: c.company ?? "—",
        email: c.email ?? "—",
        phone: c.phone ?? "—",
        tax: c.tax_number ?? "—",
      })),
      xlsxColumns: [
        { header: ar ? "الاسم" : "Name", key: "name", width: 28 },
        { header: ar ? "الشركة" : "Company", key: "company", width: 26 },
        { header: t("email"), key: "email", width: 26 },
        { header: t("phone"), key: "phone", width: 18 },
        { header: ar ? "رقم ضريبي" : "Tax #", key: "tax", width: 18 },
      ],
      xlsxRows: filtered.map((c) => ({
        name: (ar ? c.name_ar || c.name_en : c.name_en || c.name_ar) ?? "",
        company: c.company ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        tax: c.tax_number ?? "",
      })),
      settings: settings ?? null,
      lang,
      currency: "SYP",
    };
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>{t("customers")}</h1>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 400 }}>
          <Search size={14} style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchCustomers")}
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
          <Plus size={16} /> {t("newCustomer")}
        </button>

      </div>

      {filtered.length === 0 ? (
        <div className="brand-card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{t("noCustomers")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%,280px),1fr))", gap: 12 }}>
          {filtered.map((c) => (
            <div key={c.id} className="brand-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "start", gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Building2 size={20} color="var(--muted)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lang === "ar" ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)}
                  </div>
                  {c.company && <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.company}</div>}
                </div>
              </div>
              <div style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                {c.email && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Mail size={12} /> {c.email}</div>}
                {c.phone && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Phone size={12} /> {c.phone}</div>}
                {c.tax_number && <div>{t("taxNumber")}: {c.tax_number}</div>}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, background: "var(--surface-2)", width: "fit-content", fontSize: 11 }}>
                  {c.default_currency === "USD" ? t("usd") : c.default_currency === "SAR" ? t("sar") : t("syp")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => { setEditing(c); setShowModal(true); }} className="brand-btn-sm" style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                  <Pencil size={13} /> {lang === "ar" ? "تعديل" : "Edit"}
                </button>
                <button onClick={() => remove(c)} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CustomerModal
          customer={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ["customers"] }); }}
        />
      )}
    </div>
  );
}

function CustomerModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang, user } = useApp();
  const [form, setForm] = useState({
    name_ar: customer?.name_ar ?? "",
    name_en: customer?.name_en ?? "",
    company: customer?.company ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    tax_number: customer?.tax_number ?? "",
    default_currency: (customer?.default_currency ?? "SYP") as Currency,
    notes: customer?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name_ar && !form.name_en) { toast.error(t("customer")); return; }
    setSaving(true);
    const payload = {
      ...form,
      created_by: customer ? undefined : user?.id,
    };
    const { error } = customer
      ? await supabase.from("customers").update(payload).eq("id", customer.id)
      : await supabase.from("customers").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{customer ? t("editCustomer") : t("newCustomer")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <Field label={t("customer") + " (عربي)"}><input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} style={inp} /></Field>
          <Field label={t("customer") + " (English)"}><input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} style={inp} /></Field>
          <Field label={t("companyName")}><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} /></Field>
            <Field label={t("companyPhone")}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inp} /></Field>
          </div>
          <Field label={t("companyAddressAr")}><textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={t("taxNumber")}><input value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} style={inp} /></Field>
            <Field label={t("currency")}>
              <select value={form.default_currency} onChange={(e) => setForm({ ...form, default_currency: e.target.value as Currency })} style={inp}>
                <option value="SYP">SYP · ل.س</option>
                <option value="USD">USD · $</option>
                <option value="SAR">SAR · ر.س</option>
              </select>
            </Field>
          </div>
          <Field label={lang === "ar" ? "ملاحظات" : "Notes"}><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
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
