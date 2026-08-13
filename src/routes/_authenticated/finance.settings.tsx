import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { vaultDb as supabase } from "@/lib/finance/vault-db";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import { Save, Plus, Trash2, TrendingUp } from "lucide-react";
import type { FinancialSettings, FxRate } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { useConfirm } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/finance/settings")({
  component: FinanceSettingsPage,
});

function FinanceSettingsPage() {
  const { t, lang } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const { data: settings } = useQuery({
    queryKey: ["financial_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_settings").select("*").eq("id", true).maybeSingle();
      return data as FinancialSettings | null;
    },
  });

  const { data: fxRates } = useQuery({
    queryKey: ["fx_rates"],
    queryFn: async () => {
      const { data } = await supabase.from("fx_rates").select("*").order("effective_date", { ascending: false });
      return (data ?? []) as FxRate[];
    },
  });

  const [form, setForm] = useState<Partial<FinancialSettings>>({});
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  const [saving, setSaving] = useState(false);

  const saveSettings = async () => {
    setSaving(true);
    const { error } = await supabase.from("financial_settings").update(form).eq("id", true);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["financial_settings"] });
  };

  const [newRate, setNewRate] = useState<number>(0);
  const [newRateDate, setNewRateDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [addingRate, setAddingRate] = useState(false);

  const addRate = async () => {
    if (newRate <= 0) { toast.error(t("fxRate")); return; }
    setAddingRate(true);
    const { error } = await supabase.from("fx_rates").upsert({ effective_date: newRateDate, syp_per_usd: newRate }, { onConflict: "effective_date" });
    setAddingRate(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    setNewRate(0);
    qc.invalidateQueries({ queryKey: ["fx_rates"] });
  };

  const removeRate = async (id: string) => {
    if (!(await confirm({ message: t("delete") + "?", danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("fx_rates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["fx_rates"] });
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 900 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{t("financialSettings")}</h1>

      {/* Company block */}
      <section className="brand-card" style={{ padding: 20, display: "grid", gap: 12 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{lang === "ar" ? "بيانات الشركة" : "Company Details"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("companyLegalNameAr")}><input value={form.company_name_ar ?? ""} onChange={(e) => setForm({ ...form, company_name_ar: e.target.value })} style={inp} /></Field>
          <Field label={t("companyLegalNameEn")}><input value={form.company_name_en ?? ""} onChange={(e) => setForm({ ...form, company_name_en: e.target.value })} style={inp} /></Field>
          <Field label={t("companyAddressAr")}><textarea value={form.company_address_ar ?? ""} onChange={(e) => setForm({ ...form, company_address_ar: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
          <Field label={t("companyAddressEn")}><textarea value={form.company_address_en ?? ""} onChange={(e) => setForm({ ...form, company_address_en: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
          <Field label={t("companyPhone")}><input value={form.company_phone ?? ""} onChange={(e) => setForm({ ...form, company_phone: e.target.value })} style={inp} /></Field>
          <Field label={t("companyEmail")}><input type="email" value={form.company_email ?? ""} onChange={(e) => setForm({ ...form, company_email: e.target.value })} style={inp} /></Field>
          <Field label={t("taxNumber")}><input value={form.tax_number ?? ""} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} style={inp} /></Field>
          <Field label={t("defaultTaxRate") + " (%)"}><input type="number" min={0} max={100} step="0.01" value={form.default_tax_rate ?? 0} onChange={(e) => setForm({ ...form, default_tax_rate: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
        </div>
        <Field label={t("bankDetails") + " (عربي)"}><textarea value={form.bank_details_ar ?? ""} onChange={(e) => setForm({ ...form, bank_details_ar: e.target.value })} rows={3} style={{ ...inp, resize: "vertical" }} /></Field>
        <Field label={t("bankDetails") + " (English)"}><textarea value={form.bank_details_en ?? ""} onChange={(e) => setForm({ ...form, bank_details_en: e.target.value })} rows={3} style={{ ...inp, resize: "vertical" }} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("invoicePrefix")}><input value={form.invoice_number_prefix ?? "INV"} onChange={(e) => setForm({ ...form, invoice_number_prefix: e.target.value })} style={inp} /></Field>
          <Field label={t("currency")}>
            <select value={form.default_currency ?? "SYP"} onChange={(e) => setForm({ ...form, default_currency: e.target.value as "SYP" | "USD" })} style={inp}>
              <option value="SYP">SYP · ل.س</option>
              <option value="USD">USD · $</option>
            </select>
          </Field>
        </div>
        <Field label={t("termsArabic")}><textarea value={form.invoice_terms_ar ?? ""} onChange={(e) => setForm({ ...form, invoice_terms_ar: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
        <Field label={t("termsEnglish")}><textarea value={form.invoice_terms_en ?? ""} onChange={(e) => setForm({ ...form, invoice_terms_en: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
        <div style={{ textAlign: "end" }}>
          <button onClick={saveSettings} disabled={saving} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
            <Save size={16} /> {t("save")}
          </button>
        </div>
      </section>

      {/* FX Rates */}
      <section className="brand-card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={16} /> {t("fxRate")} — {t("fxRateHint")}
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginBottom: 14, padding: 12, background: "var(--surface-2)", borderRadius: 10 }}>
          <Field label={t("effectiveDate")}><input type="date" value={newRateDate} onChange={(e) => setNewRateDate(e.target.value)} style={inp} /></Field>
          <Field label={t("fxRate") + " (SYP/USD)"}><input type="number" min={0} step="0.01" value={newRate || ""} onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)} style={inp} /></Field>
          <button onClick={addRate} disabled={addingRate} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
            <Plus size={16} /> {t("updateFxRate")}
          </button>
        </div>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>{t("fxHistory")}</h4>
        {(fxRates?.length ?? 0) === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>—</div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {fxRates?.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13 }}>{formatDate(r.effective_date, lang)}</span>
                <span style={{ fontWeight: 700 }}>1 USD = {Number(r.syp_per_usd).toLocaleString()} SYP</span>
                <button onClick={() => removeRate(r.id)} className="brand-btn-sm" style={{ background: "transparent", color: "#F0676A", border: "none", padding: 4 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
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
