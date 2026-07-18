import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { toast } from "sonner";
import {
  formatMoney, computeInvoiceTotals, lineTotal, invoiceStatusColor, invoiceStatusKey, paymentMethodKey,
  type Invoice, type InvoiceItem, type InvoicePayment, type Customer, type Currency, type PaymentMethod, type FinancialSettings, type FxRate,
} from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { Plus, Trash2, Save, Send, Download, DollarSign, ArrowLeft, X, Ban, Receipt } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { stampFilename } from "@/lib/pdf/brand";
import { InvoiceDocument, PaymentReceiptDocument, paymentMethodTextFor, type CompanySettings } from "@/components/finance/BrandedDocuments";
import { PaymentMethodSelect } from "@/components/finance/PaymentMethodSelect";
import { printReactDocument } from "@/lib/pdf/print-document";
import { DatePickerField } from "@/components/DatePickerField";
import { explainSupabaseError } from "@/lib/permission-errors";

function errMsg(e: unknown, ctx: { action: "create" | "update" | "delete"; entity: string; user: ReturnType<typeof useApp>["user"]; lang: "ar" | "en" }): string {
  if (e && typeof e === "object" && ("code" in e || "message" in e || "details" in e)) {
    const obj = e as { code?: string; message?: string; details?: string; hint?: string };
    const msg = explainSupabaseError({ code: obj.code ?? "", message: obj.message ?? "", details: obj.details ?? "", hint: obj.hint ?? "" }, ctx);
    if (msg) return msg;
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e); } catch { return ctx.lang === "ar" ? "خطأ غير معروف" : "Unknown error"; }
}

export const Route = createFileRoute("/_authenticated/finance/invoices/$id")({
  component: InvoiceEditorPage,
});

type LocalItem = {
  id: string;
  description_ar: string;
  description_en: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  sort_order: number;
  __new?: boolean;
};

function newLocalItem(sort_order: number): LocalItem {
  return { id: crypto.randomUUID(), description_ar: "", description_en: "", quantity: 1, unit_price: 0, discount_amount: 0, sort_order, __new: true };
}

function InvoiceEditorPage() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t, lang, user } = useApp();
  const confirm = useConfirm();

  const { data: settings } = useQuery({
    queryKey: ["financial_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_settings").select("*").eq("id", true).maybeSingle();
      return data as FinancialSettings | null;
    },
  });

  const { data: latestFx } = useQuery({
    queryKey: ["fx_rates", "latest"],
    queryFn: async () => {
      const { data } = await supabase.from("fx_rates").select("*").order("effective_date", { ascending: false }).limit(1).maybeSingle();
      return data as FxRate | null;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers", "active"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").eq("active", true).order("created_at", { ascending: false });
      return (data ?? []) as Customer[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["invoice", id],
    enabled: !isNew,
    queryFn: async () => {
      const [inv, its, pays] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
        supabase.from("invoice_payments").select("*").eq("invoice_id", id).order("paid_at", { ascending: false }),
      ]);
      if (inv.error) throw inv.error;
      return {
        invoice: inv.data as Invoice,
        items: (its.data ?? []) as InvoiceItem[],
        payments: (pays.data ?? []) as InvoicePayment[],
      };
    },
  });

  const [customerId, setCustomerId] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [currency, setCurrency] = useState<Currency>("SYP");
  const [invDiscount, setInvDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [notesAr, setNotesAr] = useState<string>("");
  const [notesEn, setNotesEn] = useState<string>("");
  const [termsAr, setTermsAr] = useState<string>("");
  const [termsEn, setTermsEn] = useState<string>("");
  const [items, setItems] = useState<LocalItem[]>([newLocalItem(0)]);
  const [saving, setSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  // Load existing invoice into form
  useEffect(() => {
    if (!existing) return;
    const inv = existing.invoice;
    setCustomerId(inv.customer_id);
    setIssueDate(inv.issue_date);
    setDueDate(inv.due_date ?? "");
    setCurrency(inv.currency);
    setInvDiscount(Number(inv.discount_amount));
    setTaxRate(Number(inv.tax_rate));
    setNotesAr(inv.notes_ar ?? "");
    setNotesEn(inv.notes_en ?? "");
    setTermsAr(inv.terms_ar ?? "");
    setTermsEn(inv.terms_en ?? "");
    setItems(existing.items.length > 0 ? existing.items.map((it) => ({
      id: it.id,
      description_ar: it.description_ar ?? "",
      description_en: it.description_en ?? "",
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      discount_amount: Number(it.discount_amount),
      sort_order: it.sort_order,
    })) : [newLocalItem(0)]);
  }, [existing]);

  // Preset from settings/customer on new
  useEffect(() => {
    if (!isNew || !settings) return;
    setTaxRate(Number(settings.default_tax_rate));
    setNotesAr(settings.invoice_terms_ar ?? "");
    setNotesEn(settings.invoice_terms_en ?? "");
  }, [isNew, settings]);

  useEffect(() => {
    if (!customerId || !isNew) return;
    const c = customers?.find((x) => x.id === customerId);
    if (c) setCurrency(c.default_currency);
  }, [customerId, customers, isNew]);

  const totals = useMemo(() => computeInvoiceTotals(
    items.map((it) => ({ quantity: it.quantity, unit_price: it.unit_price, discount_amount: it.discount_amount })),
    invDiscount, taxRate,
  ), [items, invDiscount, taxRate]);

  const isEditable = isNew || existing?.invoice.status === "draft";

  const addItem = () => setItems([...items, newLocalItem(items.length)]);
  const removeItem = (id: string) => setItems(items.filter((i) => i.id !== id));
  const updateItem = (id: string, patch: Partial<LocalItem>) => setItems(items.map((i) => i.id === id ? { ...i, ...patch } : i));

  const persist = async (issue: boolean) => {
    if (!customerId) { toast.error(t("customer")); return; }
    if (items.length === 0 || items.every((it) => !it.description_ar && !it.description_en)) { toast.error(t("addItem")); return; }
    setSaving(true);
    try {
      const rate = latestFx ? Number(latestFx.syp_per_usd) : null;
      const invoicePayload = {
        customer_id: customerId,
        issue_date: issueDate,
        due_date: dueDate || null,
        currency,
        exchange_rate_to_usd: rate,
        subtotal: totals.subtotal,
        discount_amount: invDiscount,
        tax_rate: taxRate,
        tax_amount: totals.taxAmount,
        total: totals.total,
        notes_ar: notesAr || null,
        notes_en: notesEn || null,
        terms_ar: termsAr || null,
        terms_en: termsEn || null,
      };
      let invoiceId = isNew ? "" : id;

      if (isNew) {
        const { data: numData, error: numErr } = await supabase.rpc("next_invoice_number");
        if (numErr) throw numErr;
        const { data: inserted, error: insErr } = await supabase
          .from("invoices")
          .insert({
            ...invoicePayload,
            number: numData as unknown as string,
            status: issue ? "issued" : "draft",
            created_by: user?.id,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        invoiceId = inserted.id;
      } else {
        const { error: updErr } = await supabase.from("invoices").update({
          ...invoicePayload,
          status: issue ? "issued" : existing?.invoice.status,
        }).eq("id", invoiceId);
        if (updErr) throw updErr;
        // wipe old items
        await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      }

      // insert items
      const itemsPayload = items
        .filter((it) => (it.description_ar || it.description_en) && it.quantity > 0)
        .map((it, idx) => ({
          invoice_id: invoiceId,
          description_ar: it.description_ar || null,
          description_en: it.description_en || null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_amount: it.discount_amount,
          line_total: lineTotal(it.quantity, it.unit_price, it.discount_amount),
          sort_order: idx,
        }));
      if (itemsPayload.length > 0) {
        const { error: itemsErr } = await supabase.from("invoice_items").insert(itemsPayload);
        if (itemsErr) throw itemsErr;
      }

      toast.success(t("saved"));
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      if (isNew) navigate({ to: "/finance/invoices/$id", params: { id: invoiceId } });
    } catch (e) {
      toast.error(errMsg(e, { action: isNew ? "create" : "update", entity: "invoice", user, lang }));
    } finally {
      setSaving(false);
    }
  };

  const voidInvoice = async () => {
    if (isNew || !existing) return;
    if (!(await confirm({ message: t("confirmVoidInvoice"), danger: true, confirmText: t("voidInvoice") }))) return;
    const { error } = await supabase.from("invoices").update({ status: "void" }).eq("id", id);
    if (error) { toast.error(errMsg(error, { action: "update", entity: "invoice", user, lang })); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoice", id] });
  };

  const deleteInvoice = async () => {
    if (isNew || !existing) return;
    if (!(await confirm({ message: t("confirmDeleteInvoice"), danger: true, confirmText: t("delete") }))) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error(errMsg(error, { action: "delete", entity: "invoice", user, lang })); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["invoices"] });
    navigate({ to: "/finance/invoices" });
  };

  const downloadPdf = async () => {
    if (isNew || !existing) { toast.error(t("saveDraft")); return; }
    const cust = customers?.find((c) => c.id === existing.invoice.customer_id) ?? null;
    try {
      await printReactDocument(
        <InvoiceDocument
          invoice={existing.invoice}
          items={existing.items}
          customer={cust}
          settings={(settings as CompanySettings | null) ?? null}
          lang={lang}
        />,
        {
          title: stampFilename("invoice", existing.invoice.number ?? "draft").replace(/\.pdf$/, ""),
          lang,
        },
      );
    } catch (e) {
      toast.error(errMsg(e, { action: "update", entity: "invoice", user, lang }));
    }
  };
  

  const [receiptPayment, setReceiptPayment] = useState<InvoicePayment | null>(null);


  const statusColors = existing ? invoiceStatusColor(existing.invoice.status) : null;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => navigate({ to: "/finance/invoices" })} className="brand-btn-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
          <ArrowLeft size={14} />
        </button>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>
          {isNew ? t("newInvoice") : existing?.invoice.number}
        </h1>
        {existing && statusColors && (
          <span style={{ padding: "4px 12px", borderRadius: 8, background: statusColors.bg, color: statusColors.fg, fontSize: 12, fontWeight: 700 }}>
            {t(invoiceStatusKey(existing.invoice.status))}
          </span>
        )}
        {existing && (
          <button onClick={downloadPdf} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
            <Download size={16} /> {t("downloadPdf")}
          </button>
        )}
        {existing && existing.invoice.status !== "paid" && existing.invoice.status !== "void" && (
          <button onClick={() => setShowPayment(true)} className="brand-btn" style={{ background: "var(--grad-green, linear-gradient(135deg,#50C878,#3d9c5e))", color: "#fff" }}>
            <DollarSign size={16} /> {t("recordPayment")}
          </button>
        )}
      </div>

      {/* Header form */}
      <section className="brand-card" style={{ padding: 20, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <Field label={t("customer") + " *"}>
          <select disabled={!isEditable} value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
            <option value="">—</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === "ar" ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)}{c.company ? ` · ${c.company}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("invoiceDate")}>
          {isEditable
            ? <DatePickerField value={issueDate} onChange={setIssueDate} lang={lang} />
            : <div style={{ ...inp, opacity: 0.7 }}>{issueDate ? formatDate(issueDate, lang) : "—"}</div>}
        </Field>
        <Field label={t("dueDate")}>
          {isEditable
            ? <DatePickerField value={dueDate} onChange={setDueDate} lang={lang} placeholder={lang === "ar" ? "بدون تاريخ" : "No due date"} />
            : <div style={{ ...inp, opacity: 0.7 }}>{dueDate ? formatDate(dueDate, lang) : "—"}</div>}
        </Field>
        <Field label={t("currency")}>
          <select disabled={!isEditable} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} style={inp}>
            <option value="SYP">SYP · ل.س</option>
            <option value="USD">USD · $</option>
          </select>
        </Field>
      </section>

      {/* Items */}
      <section className="brand-card" style={{ padding: 20 }}>
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th style={th}>{t("description")}</th>
                <th style={{ ...th, width: 80 }}>{t("quantity")}</th>
                <th style={{ ...th, width: 130 }}>{t("unitPrice")}</th>
                <th style={{ ...th, width: 110 }}>{t("discount")}</th>
                <th style={{ ...th, width: 130, textAlign: "end" }}>{t("lineTotal")}</th>
                {isEditable && <th style={{ ...th, width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: 6 }}>
                    <input disabled={!isEditable} value={lang === "ar" ? it.description_ar : it.description_en} onChange={(e) => updateItem(it.id, lang === "ar" ? { description_ar: e.target.value } : { description_en: e.target.value })} placeholder={lang === "ar" ? "الوصف بالعربية" : "Description"} style={{ ...inp, padding: "8px 10px" }} />
                    <input disabled={!isEditable} value={lang === "ar" ? it.description_en : it.description_ar} onChange={(e) => updateItem(it.id, lang === "ar" ? { description_en: e.target.value } : { description_ar: e.target.value })} placeholder={lang === "ar" ? "English description (optional)" : "الوصف عربي (اختياري)"} style={{ ...inp, padding: "6px 10px", marginTop: 4, fontSize: 12, color: "var(--muted)" }} />
                  </td>
                  <td style={{ padding: 6 }}><input disabled={!isEditable} type="number" min={0} step="0.01" value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: parseFloat(e.target.value) || 0 })} style={{ ...inp, padding: "8px 10px", textAlign: "end" }} /></td>
                  <td style={{ padding: 6 }}><input disabled={!isEditable} type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => updateItem(it.id, { unit_price: parseFloat(e.target.value) || 0 })} style={{ ...inp, padding: "8px 10px", textAlign: "end" }} /></td>
                  <td style={{ padding: 6 }}><input disabled={!isEditable} type="number" min={0} step="0.01" value={it.discount_amount} onChange={(e) => updateItem(it.id, { discount_amount: parseFloat(e.target.value) || 0 })} style={{ ...inp, padding: "8px 10px", textAlign: "end" }} /></td>
                  <td style={{ padding: "8px 12px", textAlign: "end", fontWeight: 600 }}>{formatMoney(lineTotal(it.quantity, it.unit_price, it.discount_amount), currency, lang)}</td>
                  {isEditable && (
                    <td style={{ padding: 6, textAlign: "center" }}>
                      {items.length > 1 && (
                        <button onClick={() => removeItem(it.id)} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)", padding: "6px 8px" }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isEditable && (
          <button onClick={addItem} className="brand-btn-sm" style={{ marginTop: 10, background: "var(--surface-2)", border: "1px dashed var(--border)", color: "var(--muted)" }}>
            <Plus size={13} /> {t("addItem")}
          </button>
        )}
      </section>

      {/* Totals + notes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        <section className="brand-card" style={{ padding: 20, display: "grid", gap: 12 }}>
          <Field label={t("notesArabic")}><textarea disabled={!isEditable} value={notesAr} onChange={(e) => setNotesAr(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
          <Field label={t("notesEnglish")}><textarea disabled={!isEditable} value={notesEn} onChange={(e) => setNotesEn(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
          <Field label={t("termsArabic")}><textarea disabled={!isEditable} value={termsAr} onChange={(e) => setTermsAr(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
          <Field label={t("termsEnglish")}><textarea disabled={!isEditable} value={termsEn} onChange={(e) => setTermsEn(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
        </section>
        <section className="brand-card" style={{ padding: 20, display: "grid", gap: 10 }}>
          <TotalRow label={t("subtotal")} value={formatMoney(totals.subtotal, currency, lang)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>{t("discount")}</span>
            <input disabled={!isEditable} type="number" min={0} step="0.01" value={invDiscount} onChange={(e) => setInvDiscount(parseFloat(e.target.value) || 0)} style={{ ...inp, width: 130, padding: "6px 10px", textAlign: "end" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>{t("taxRate")}</span>
            <input disabled={!isEditable} type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} style={{ ...inp, width: 130, padding: "6px 10px", textAlign: "end" }} />
          </div>
          <TotalRow label={t("taxAmount")} value={formatMoney(totals.taxAmount, currency, lang)} />
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
            <TotalRow label={t("grandTotal")} value={formatMoney(totals.total, currency, lang)} bold />
          </div>
          {existing && (
            <>
              <TotalRow label={t("amountPaid")} value={formatMoney(existing.invoice.amount_paid, currency, lang)} color="#50C878" />
              <TotalRow label={t("amountDue")} value={formatMoney(Number(existing.invoice.total) - Number(existing.invoice.amount_paid), currency, lang)} color="#F0676A" bold />
            </>
          )}

          {isEditable && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <button onClick={() => persist(false)} disabled={saving} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
                <Save size={16} /> {t("saveDraft")}
              </button>
              <button onClick={() => persist(true)} disabled={saving} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff" }}>
                <Send size={16} /> {t("issueInvoice")}
              </button>
            </div>
          )}

          {existing && existing.invoice.status !== "void" && existing.invoice.status !== "paid" && (
            <button onClick={voidInvoice} className="brand-btn-sm" style={{ marginTop: 8, background: "rgba(240,103,106,.10)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)" }}>
              <Ban size={13} /> {t("voidInvoice")}
            </button>
          )}
          {existing && existing.invoice.status === "draft" && (
            <button onClick={deleteInvoice} className="brand-btn-sm" style={{ background: "rgba(240,103,106,.15)", color: "#F0676A", border: "1px solid rgba(240,103,106,.35)" }}>
              <Trash2 size={13} /> {t("delete")}
            </button>
          )}
        </section>
      </div>

      {/* Payments log */}
      {existing && existing.payments.length > 0 && (
        <section className="brand-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>{t("payments")}</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {existing.payments.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 10, alignItems: "center", padding: "10px 12px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDate(p.paid_at, lang)}</span>
                <span style={{ fontSize: 13 }}>{t(paymentMethodKey(p.method))}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#50C878" }}>{formatMoney(p.amount, p.currency, lang)}</span>
                <button
                  onClick={() => setReceiptPayment(p)}
                  className="brand-btn-sm"
                  title={t("paymentReceipt")}
                  style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--foreground)", padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <Receipt size={13} /> {t("paymentReceipt")}
                </button>
                <PaymentDeleteButton id={p.id} onDone={() => qc.invalidateQueries({ queryKey: ["invoice", id] })} />
              </div>
            ))}
          </div>
        </section>
      )}

      {showPayment && existing && (
        <PaymentModal
          invoice={existing.invoice}
          onClose={() => setShowPayment(false)}
          onSaved={() => { setShowPayment(false); qc.invalidateQueries({ queryKey: ["invoice", id] }); qc.invalidateQueries({ queryKey: ["invoices"] }); }}
        />
      )}

      {receiptPayment && existing && (
        <PaymentReceiptModal
          payment={receiptPayment}
          invoice={existing.invoice}
          customer={customers?.find((c) => c.id === existing.invoice.customer_id) ?? null}
          settings={(settings as CompanySettings | null) ?? null}
          onClose={() => setReceiptPayment(null)}
        />
      )}
    </div>
  );
}

function PaymentDeleteButton({ id, onDone }: { id: string; onDone: () => void }) {
  const confirm = useConfirm();
  const { t, user, lang } = useApp();
  const remove = async () => {
    if (!(await confirm({ message: t("delete") + "?", danger: true }))) return;
    const { error } = await supabase.from("invoice_payments").delete().eq("id", id);
    if (error) { toast.error(errMsg(error, { action: "delete", entity: "payment", user, lang })); return; }
    onDone();
  };
  return (
    <button onClick={remove} className="brand-btn-sm" style={{ background: "transparent", border: "none", color: "#F0676A", padding: 4 }}>
      <X size={14} />
    </button>
  );
}

function PaymentReceiptModal({
  payment, invoice, customer, settings, onClose,
}: {
  payment: InvoicePayment;
  invoice: Invoice;
  customer: Customer | null;
  settings: CompanySettings | null;
  onClose: () => void;
}) {
  const { t, lang } = useApp();
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      await printReactDocument(
        <PaymentReceiptDocument
          payment={payment}
          invoice={invoice}
          customer={customer}
          settings={settings}
          lang={lang}
          methodLabel={paymentMethodTextFor(payment.method, lang)}
        />,
        {
          title: stampFilename("receipt", (payment.id ?? "").slice(0, 8)).replace(/\.pdf$/, ""),
          lang,
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "ar" ? "فشل التنزيل" : "Download failed"));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 480, width: "100%" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>{t("paymentReceipt")}</h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 13 }}>
          {formatDate(payment.paid_at, lang)} · {formatMoney(payment.amount, payment.currency, lang)}
        </p>
        <div style={{ padding: 14, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16, fontSize: 13, lineHeight: 1.8 }}>
          <div><b>{t("customer")}:</b> {customer ? (lang === "ar" ? customer.name_ar || customer.name_en : customer.name_en || customer.name_ar) : "—"}</div>
          <div><b>{t("invoice")}:</b> {invoice.number ?? "—"}</div>
          <div><b>{t("paymentMethod")}:</b> {paymentMethodTextFor(payment.method, lang)}</div>
          {payment.reference && <div><b>{t("reference")}:</b> {payment.reference}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
          <button onClick={download} disabled={downloading} className="brand-btn" style={{ background: "var(--grad-blue)", color: "#fff", opacity: downloading ? 0.6 : 1 }}>
            <Download size={16} /> {t("downloadPdf")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ invoice, onClose, onSaved }: { invoice: Invoice; onClose: () => void; onSaved: () => void }) {
  const { t, user, lang } = useApp();
  const balance = Number(invoice.total) - Number(invoice.amount_paid);
  const [amount, setAmount] = useState<number>(balance);
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (amount <= 0) { toast.error(t("amount")); return; }
    setSaving(true);
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id,
      amount,
      currency: invoice.currency,
      paid_at: paidAt,
      method,
      reference: reference || null,
      notes: notes || null,
      recorded_by: user?.id,
    });
    setSaving(false);
    if (error) { toast.error(errMsg(error, { action: "create", entity: "payment", user, lang })); return; }
    toast.success(t("saved"));
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="brand-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", padding: 20, borderRadius: 16, maxWidth: 460, width: "100%" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{t("recordPayment")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <Field label={t("amount")}>
            <input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} style={inp} />
          </Field>
          <Field label={t("paidAt")}>
            <DatePickerField value={paidAt} onChange={setPaidAt} lang={lang} />
          </Field>
          <Field label={t("paymentMethod")}>
            <PaymentMethodSelect value={method} onChange={setMethod} />
          </Field>
          <Field label={t("reference")}><input value={reference} onChange={(e) => setReference(e.target.value)} style={inp} /></Field>
          <Field label={t("notesArabic")}><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="brand-btn" style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{t("cancel")}</button>
          <button onClick={save} disabled={saving} className="brand-btn" style={{ background: "var(--grad-green, linear-gradient(135deg,#50C878,#3d9c5e))", color: "#fff", opacity: saving ? 0.6 : 1 }}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: bold ? 18 : 14, fontWeight: bold ? 800 : 600, color: color ?? "var(--foreground)" }}>{value}</span>
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

const th: React.CSSProperties = { padding: "8px 12px", textAlign: "start", fontSize: 11, fontWeight: 700, textTransform: "uppercase" };
