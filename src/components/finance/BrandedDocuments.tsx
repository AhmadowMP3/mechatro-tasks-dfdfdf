// Document templates rendered off-screen and captured to PDF via
// src/lib/pdf-export.ts. Each template renders only the body content — the
// unified Mechatro header (logo) and footer (Page X/Y + generated meta) are
// drawn natively on every page by src/lib/pdf/chrome.ts. This keeps ALL PDFs
// on the same brand and eliminates duplicated header/footer variants.

import { formatMoney, type Currency, type Invoice, type InvoiceItem, type InvoicePayment, type Customer, type PaymentMethod } from "@/lib/finance";
import { formatDate } from "@/lib/format";

type Lang = "ar" | "en";

// Brand tokens are duplicated here in RGB form so the rasterized document
// matches the native chrome. Any change in src/lib/pdf/brand.ts should be
// mirrored here. DARK theme — matches src/styles.css.
const page = "#081320";
const navy = "#0F2031";       // card surface (was solid navy header row → now the elevated card)
const surface2 = "#13283D";   // header/totals band
const blue = "#42C2EE";
const gold = "#D4A017";
const ink = "#E6EEF7";
const ink2 = "#CBD5E1";
const muted = "#94A3B8";
const border = "#1E3A57";
const zebra = "#0B1A2A";
const green = "#73C94E";
const red = "#EF4444";
const grad = `linear-gradient(135deg, ${page} 0%, ${surface2} 100%)`;

// A4 width at 96dpi. The A4 content zone (after native chrome margins) is
// 24mm top + 16mm bottom = 40mm reserved; leave equivalent breathing room at
// the top of the first page so the rasterized title never collides with the
// header logo.
const A4_WIDTH_PX = 794;
const CONTENT_TOP_PADDING = 60;   // px — clears native header band
const CONTENT_BOTTOM_PADDING = 44; // px — clears native footer band

function pageWrap(lang: Lang): React.CSSProperties {
  return {
    width: A4_WIDTH_PX,
    background: page,
    color: ink,
    fontFamily: lang === "ar"
      ? "'Montserrat Arabic', 'Almarai', 'Segoe UI', sans-serif"
      : "'Montserrat', 'Montserrat Arabic', system-ui, sans-serif",
    padding: `${CONTENT_TOP_PADDING}px 40px ${CONTENT_BOTTOM_PADDING}px`,
    direction: lang === "ar" ? "rtl" : "ltr",
    fontSize: 12,
    lineHeight: 1.55,
    boxSizing: "border-box",
  };
}

function DocTitle({ title, subtitle, tone = "blue" }: { title: string; subtitle?: string; tone?: "blue" | "gold" }) {
  const accent = tone === "gold" ? gold : blue;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: 3, textTransform: "uppercase" }}>
            {subtitle ?? ""}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: ink, letterSpacing: 0.4 }}>{title}</div>
        </div>
        <div style={{ width: 60, height: 6, background: accent, borderRadius: 3, marginBottom: 8 }} />
      </div>
      <div style={{ height: 1, background: `linear-gradient(90deg, ${accent}, transparent)`, marginTop: 10 }} />
    </div>
  );
}

function CompanyBlock({ settings, lang }: { settings: CompanySettings | null; lang: Lang }) {
  if (!settings) return null;
  const name = lang === "ar" ? settings.company_name_ar || settings.company_name_en : settings.company_name_en || settings.company_name_ar;
  return (
    <div style={{ fontSize: 11, color: muted, lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, color: ink, fontSize: 14 }}>{name}</div>
      {settings.company_address && <div>{settings.company_address}</div>}
      {settings.company_phone && <div>{lang === "ar" ? "هاتف" : "Tel"}: {settings.company_phone}</div>}
      {settings.company_email && <div>{settings.company_email}</div>}
      {settings.tax_number && <div>{lang === "ar" ? "رقم ضريبي" : "Tax ID"}: {settings.tax_number}</div>}
    </div>
  );
}

function StatusPill({ text, tone }: { text: string; tone: "green" | "red" | "blue" | "gray" }) {
  const map = {
    green: { bg: "rgba(115,201,78,.14)", fg: green, br: `${green}66` },
    red:   { bg: "rgba(239,68,68,.14)",   fg: red,   br: `${red}66` },
    blue:  { bg: "rgba(66,194,238,.14)",  fg: blue,  br: `${blue}66` },
    gray:  { bg: "rgba(148,163,184,.14)", fg: muted, br: `${muted}66` },
  };
  const c = map[tone];
  return (
    <span style={{ display: "inline-block", padding: "5px 14px", background: c.bg, color: c.fg, border: `1px solid ${c.br}`, borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>
      {text}
    </span>
  );
}

export type CompanySettings = {
  company_name_ar: string | null;
  company_name_en: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  tax_number: string | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_iban: string | null;
  bank_swift: string | null;
  invoice_footer_ar: string | null;
  invoice_footer_en: string | null;
};

// ============================================================
// INVOICE
// ============================================================
export function InvoiceDocument({
  invoice, items, customer, settings, lang,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: Customer | null;
  settings: CompanySettings | null;
  lang: Lang;
}) {
  const balance = Number(invoice.total) - Number(invoice.amount_paid);
  const statusTone: "green" | "red" | "blue" | "gray" =
    invoice.status === "paid" ? "green" : invoice.status === "overdue" ? "red" : invoice.status === "void" ? "gray" : "blue";
  const statusText: Record<string, { ar: string; en: string }> = {
    draft: { ar: "مسودة", en: "DRAFT" },
    issued: { ar: "صادرة", en: "ISSUED" },
    partially_paid: { ar: "مدفوعة جزئياً", en: "PARTIALLY PAID" },
    paid: { ar: "مدفوعة", en: "PAID" },
    overdue: { ar: "متأخرة", en: "OVERDUE" },
    void: { ar: "ملغاة", en: "VOID" },
  };
  const st = statusText[invoice.status] ?? statusText.issued;

  return (
    <div style={pageWrap(lang)}>
      <DocTitle
        subtitle={lang === "ar" ? "فاتورة" : "INVOICE"}
        title={invoice.number ?? (lang === "ar" ? "بدون رقم" : "Untitled")}
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
        <CompanyBlock settings={settings} lang={lang} />
        <div style={{ textAlign: lang === "ar" ? "left" : "right", fontSize: 12 }}>
          <div style={{ marginBottom: 8 }}><StatusPill text={lang === "ar" ? st.ar : st.en} tone={statusTone} /></div>
          <div style={{ color: muted }}>{lang === "ar" ? "تاريخ الإصدار" : "Issue date"}</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{formatDate(invoice.issue_date, lang)}</div>
          {invoice.due_date && (
            <>
              <div style={{ color: muted }}>{lang === "ar" ? "تاريخ الاستحقاق" : "Due date"}</div>
              <div style={{ fontWeight: 700 }}>{formatDate(invoice.due_date, lang)}</div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ background: zebra, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>
            {lang === "ar" ? "الفاتورة إلى" : "Bill To"}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {customer ? (lang === "ar" ? customer.name_ar || customer.name_en : customer.name_en || customer.name_ar) : "—"}
          </div>
          {customer?.company && <div style={{ fontSize: 12, color: muted }}>{customer.company}</div>}
          {customer?.address && <div style={{ fontSize: 12, color: muted }}>{customer.address}</div>}
          <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
            {customer?.email}{customer?.email && customer?.phone ? " · " : ""}{customer?.phone}
          </div>
        </div>
      </div>

      <div className="pdf-flow">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: navy, color: "#fff" }}>
              <th style={{ padding: "10px 12px", textAlign: lang === "ar" ? "right" : "left", fontWeight: 700, fontSize: 11, letterSpacing: 0.4, borderBottom: `2px solid ${gold}` }}>
                {lang === "ar" ? "الوصف" : "Description"}
              </th>
              <th style={{ padding: "10px 12px", textAlign: "center", width: 60, fontSize: 11, borderBottom: `2px solid ${gold}` }}>{lang === "ar" ? "الكمية" : "Qty"}</th>
              <th style={{ padding: "10px 12px", textAlign: lang === "ar" ? "left" : "right", width: 110, fontSize: 11, borderBottom: `2px solid ${gold}` }}>{lang === "ar" ? "السعر" : "Unit"}</th>
              <th style={{ padding: "10px 12px", textAlign: lang === "ar" ? "left" : "right", width: 90, fontSize: 11, borderBottom: `2px solid ${gold}` }}>{lang === "ar" ? "خصم" : "Disc."}</th>
              <th style={{ padding: "10px 12px", textAlign: lang === "ar" ? "left" : "right", width: 120, fontSize: 11, borderBottom: `2px solid ${gold}` }}>{lang === "ar" ? "الإجمالي" : "Total"}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} style={{ background: i % 2 === 1 ? zebra : "#fff", borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: "10px 12px" }}>
                  {(lang === "ar" ? it.description_ar || it.description_en : it.description_en || it.description_ar) ?? "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>{Number(it.quantity)}</td>
                <td style={{ padding: "10px 12px", textAlign: lang === "ar" ? "left" : "right" }}>{formatMoney(it.unit_price, invoice.currency, lang)}</td>
                <td style={{ padding: "10px 12px", textAlign: lang === "ar" ? "left" : "right", color: muted }}>
                  {Number(it.discount_amount) > 0 ? formatMoney(it.discount_amount, invoice.currency, lang) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: lang === "ar" ? "left" : "right", fontWeight: 700 }}>
                  {formatMoney(it.line_total, invoice.currency, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: lang === "ar" ? "flex-start" : "flex-end" }}>
        <div style={{ width: 320, fontSize: 13 }}>
          <TotalRow label={lang === "ar" ? "المجموع الفرعي" : "Subtotal"} value={formatMoney(invoice.subtotal, invoice.currency, lang)} />
          {Number(invoice.discount_amount) > 0 && (
            <TotalRow label={lang === "ar" ? "خصم" : "Discount"} value={"-" + formatMoney(invoice.discount_amount, invoice.currency, lang)} muted />
          )}
          {Number(invoice.tax_rate) > 0 && (
            <TotalRow label={`${lang === "ar" ? "ضريبة" : "Tax"} (${Number(invoice.tax_rate)}%)`} value={formatMoney(invoice.tax_amount, invoice.currency, lang)} />
          )}
          <div style={{ height: 8 }} />
          <div style={{ background: navy, color: "#fff", padding: "14px 18px", borderRadius: 10, borderTop: `3px solid ${gold}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, opacity: 0.9, letterSpacing: 1.4, textTransform: "uppercase" }}>{lang === "ar" ? "الإجمالي" : "TOTAL"}</span>
            <span style={{ fontSize: 20, fontWeight: 900 }}>{formatMoney(invoice.total, invoice.currency, lang)}</span>
          </div>
          {Number(invoice.amount_paid) > 0 && (
            <>
              <TotalRow label={lang === "ar" ? "المدفوع" : "Paid"} value={formatMoney(invoice.amount_paid, invoice.currency, lang)} color={green} />
              <TotalRow label={lang === "ar" ? "الرصيد المستحق" : "Balance due"} value={formatMoney(balance, invoice.currency, lang)} color={balance > 0 ? red : green} bold />
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
        {(invoice.notes_ar || invoice.notes_en) && (
          <div style={{ background: zebra, border: `1px solid ${border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>
              {lang === "ar" ? "ملاحظات" : "Notes"}
            </div>
            <div style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
              {(lang === "ar" ? invoice.notes_ar || invoice.notes_en : invoice.notes_en || invoice.notes_ar) ?? ""}
            </div>
          </div>
        )}
        {settings?.bank_account_number && (
          <div style={{ background: zebra, border: `1px solid ${border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>
              {lang === "ar" ? "تفاصيل الحساب" : "Bank details"}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              {settings.bank_name && <div><strong>{lang === "ar" ? "البنك" : "Bank"}:</strong> {settings.bank_name}</div>}
              {settings.bank_account_holder && <div><strong>{lang === "ar" ? "المستفيد" : "Holder"}:</strong> {settings.bank_account_holder}</div>}
              {settings.bank_account_number && <div><strong>{lang === "ar" ? "الحساب" : "Acct"}:</strong> {settings.bank_account_number}</div>}
              {settings.bank_iban && <div><strong>IBAN:</strong> {settings.bank_iban}</div>}
              {settings.bank_swift && <div><strong>SWIFT:</strong> {settings.bank_swift}</div>}
            </div>
          </div>
        )}
      </div>

      {(settings?.invoice_footer_ar || settings?.invoice_footer_en) && (
        <div style={{ marginTop: 22, textAlign: "center", color: muted, fontSize: 10.5, fontStyle: "italic" }}>
          {(lang === "ar" ? settings?.invoice_footer_ar : settings?.invoice_footer_en) || ""}
        </div>
      )}
    </div>
  );
}

function TotalRow({ label, value, muted: isMuted, color, bold }: { label: string; value: string; muted?: boolean; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${border}` }}>
      <span style={{ color: isMuted ? muted : ink, fontSize: 12 }}>{label}</span>
      <span style={{ color: color ?? ink, fontWeight: bold ? 800 : 600, fontSize: 13 }}>{value}</span>
    </div>
  );
}

// ============================================================
// PAYMENT RECEIPT
// ============================================================
export function PaymentReceiptDocument({
  payment, invoice, customer, settings, lang, methodLabel,
}: {
  payment: InvoicePayment;
  invoice: Invoice;
  customer: Customer | null;
  settings: CompanySettings | null;
  lang: Lang;
  methodLabel: string;
}) {
  const balanceAfter = Number(invoice.total) - Number(invoice.amount_paid);
  const receiptNo = `RCP-${(payment.id ?? "").slice(0, 8).toUpperCase()}`;

  return (
    <div style={pageWrap(lang)}>
      <DocTitle
        subtitle={lang === "ar" ? "إيصال دفع" : "PAYMENT RECEIPT"}
        title={receiptNo}
        tone="gold"
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
        <CompanyBlock settings={settings} lang={lang} />
        <div style={{ textAlign: lang === "ar" ? "left" : "right", fontSize: 12 }}>
          <div style={{ color: muted }}>{lang === "ar" ? "تاريخ الدفع" : "Payment date"}</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{formatDate(payment.paid_at, lang)}</div>
          <div style={{ color: muted }}>{lang === "ar" ? "رقم الفاتورة" : "Invoice #"}</div>
          <div style={{ fontWeight: 700 }}>{invoice.number ?? "—"}</div>
        </div>
      </div>

      <div style={{ background: zebra, border: `1px solid ${border}`, borderRadius: 10, padding: 18, marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>
          {lang === "ar" ? "استلمنا من" : "Received From"}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          {customer ? (lang === "ar" ? customer.name_ar || customer.name_en : customer.name_en || customer.name_ar) : "—"}
        </div>
        {customer?.company && <div style={{ fontSize: 12, color: muted }}>{customer.company}</div>}
      </div>

      <div style={{
        background: `linear-gradient(135deg, ${navy} 0%, ${blue} 100%)`,
        color: "#fff",
        borderRadius: 14,
        padding: "30px 28px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        marginBottom: 22,
        borderTop: `4px solid ${gold}`,
      }}>
        <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>
          {lang === "ar" ? "المبلغ المستلم" : "Amount Received"}
        </div>
        <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: 0.5 }}>
          {formatMoney(payment.amount, payment.currency, lang)}
        </div>
        <div style={{
          position: "absolute",
          top: 20,
          [lang === "ar" ? "left" : "right"]: 20,
          border: `2.5px solid ${gold}`,
          color: gold,
          padding: "6px 16px",
          borderRadius: 8,
          fontWeight: 900,
          fontSize: 13,
          letterSpacing: 2,
          transform: "rotate(-8deg)",
          background: "rgba(255,255,255,0.08)",
        }}>
          {lang === "ar" ? "استُلم" : "RECEIVED"}
        </div>
      </div>

      <div style={{ fontSize: 13 }}>
        <DetailRow label={lang === "ar" ? "طريقة الدفع" : "Payment method"} value={methodLabel} />
        {payment.reference && (
          <DetailRow label={lang === "ar" ? "مرجع" : "Reference"} value={payment.reference} />
        )}
        <DetailRow
          label={lang === "ar" ? "إجمالي الفاتورة" : "Invoice total"}
          value={formatMoney(invoice.total, invoice.currency, lang)}
        />
        <DetailRow
          label={lang === "ar" ? "الرصيد المتبقي بعد الدفع" : "Balance after payment"}
          value={formatMoney(balanceAfter, invoice.currency, lang)}
          highlight={balanceAfter <= 0 ? green : undefined}
        />
        {payment.notes && (
          <div style={{ marginTop: 14, padding: 12, background: zebra, border: `1px solid ${border}`, borderRadius: 8, fontSize: 11 }}>
            <strong>{lang === "ar" ? "ملاحظات" : "Notes"}:</strong> {payment.notes}
          </div>
        )}
      </div>

      <div style={{ marginTop: 60, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, fontSize: 11 }}>
        <div style={{ borderTop: `1px solid ${ink}`, paddingTop: 6, textAlign: "center", color: muted }}>
          {lang === "ar" ? "توقيع العميل" : "Customer signature"}
        </div>
        <div style={{ borderTop: `1px solid ${ink}`, paddingTop: 6, textAlign: "center", color: muted }}>
          {lang === "ar" ? "التوقيع والختم" : "Authorized signature"}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${border}` }}>
      <span style={{ color: muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: highlight ?? ink }}>{value}</span>
    </div>
  );
}

// ============================================================
// PAYROLL SLIP
// ============================================================
export function PayrollSlipDocument({
  entry,
  memberName,
  periodLabel,
  currency,
  settings,
  lang,
}: {
  entry: {
    id: string;
    base_salary: number;
    housing_allowance?: number;
    transport_allowance: number;
    other_allowance: number;
    points_snapshot: number;
    tasks_done_snapshot: number;
    points_bonus: number;
    streak_bonus: number;
    manual_bonus: number;
    deductions: number;
    net_amount: number;
    notes: string | null;
  };
  memberName: string;
  periodLabel: string;
  currency: Currency;
  settings: CompanySettings | null;
  lang: Lang;
}) {
  return (
    <div style={pageWrap(lang)}>
      <DocTitle
        subtitle={lang === "ar" ? "قسيمة راتب" : "PAY SLIP"}
        title={periodLabel}
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 22 }}>
        <CompanyBlock settings={settings} lang={lang} />
        <div style={{ textAlign: lang === "ar" ? "left" : "right", fontSize: 12 }}>
          <div style={{ color: muted }}>{lang === "ar" ? "الموظف" : "Employee"}</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{memberName}</div>
          <div style={{ color: muted }}>{lang === "ar" ? "الفترة" : "Period"}</div>
          <div style={{ fontWeight: 700 }}>{periodLabel}</div>
        </div>
      </div>

      <div className="pdf-flow">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: navy, color: "#fff" }}>
              <th style={{ padding: "12px 14px", textAlign: lang === "ar" ? "right" : "left", fontSize: 11, letterSpacing: 0.4, borderBottom: `2px solid ${gold}` }}>
                {lang === "ar" ? "البند" : "Item"}
              </th>
              <th style={{ padding: "12px 14px", textAlign: lang === "ar" ? "left" : "right", fontSize: 11, borderBottom: `2px solid ${gold}` }}>
                {lang === "ar" ? "المبلغ" : "Amount"}
              </th>
            </tr>
          </thead>
          <tbody>
            <SlipRow label={lang === "ar" ? "الراتب الأساسي" : "Base salary"} amount={entry.base_salary} currency={currency} lang={lang} />
            {(entry.housing_allowance ?? 0) > 0 && <SlipRow label={lang === "ar" ? "بدل سكن" : "Housing allowance"} amount={entry.housing_allowance ?? 0} currency={currency} lang={lang} />}
            {entry.transport_allowance > 0 && <SlipRow label={lang === "ar" ? "بدل مواصلات" : "Transport allowance"} amount={entry.transport_allowance} currency={currency} lang={lang} />}
            {entry.other_allowance > 0 && <SlipRow label={lang === "ar" ? "بدلات أخرى" : "Other allowances"} amount={entry.other_allowance} currency={currency} lang={lang} />}
            {entry.points_bonus > 0 && (
              <SlipRow
                label={`${lang === "ar" ? "مكافأة النقاط" : "Points bonus"} (${entry.points_snapshot} pts · ${entry.tasks_done_snapshot} tasks)`}
                amount={entry.points_bonus} currency={currency} lang={lang}
              />
            )}
            {entry.streak_bonus > 0 && <SlipRow label={lang === "ar" ? "مكافأة الاستمرارية" : "Streak bonus"} amount={entry.streak_bonus} currency={currency} lang={lang} />}
            {entry.manual_bonus > 0 && <SlipRow label={lang === "ar" ? "مكافأة يدوية" : "Manual bonus"} amount={entry.manual_bonus} currency={currency} lang={lang} />}
            {entry.deductions > 0 && <SlipRow label={lang === "ar" ? "خصومات" : "Deductions"} amount={-entry.deductions} currency={currency} lang={lang} negative />}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ background: navy, color: "#fff", padding: "18px 24px", borderRadius: 12, borderTop: `4px solid ${gold}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.9, textTransform: "uppercase", letterSpacing: 2 }}>
            {lang === "ar" ? "صافي الراتب" : "Net Pay"}
          </span>
          <span style={{ fontSize: 26, fontWeight: 900 }}>{formatMoney(entry.net_amount, currency, lang)}</span>
        </div>
      </div>

      {entry.notes && (
        <div style={{ marginTop: 18, padding: 14, background: zebra, fontSize: 11, color: muted, borderRadius: 8, border: `1px solid ${border}` }}>
          {entry.notes}
        </div>
      )}

      <div style={{ marginTop: 60, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, fontSize: 11 }}>
        <div style={{ borderTop: `1px solid ${ink}`, paddingTop: 6, textAlign: "center", color: muted }}>
          {lang === "ar" ? "توقيع الموظف" : "Employee signature"}
        </div>
        <div style={{ borderTop: `1px solid ${ink}`, paddingTop: 6, textAlign: "center", color: muted }}>
          {lang === "ar" ? "التوقيع والختم" : "Authorized signature"}
        </div>
      </div>

      <div style={{ marginTop: 20, textAlign: "center", color: muted, fontSize: 10, fontStyle: "italic" }}>
        {lang === "ar" ? "قسيمة راتب سرية للاستخدام الداخلي فقط" : "Confidential — for internal use only"}
      </div>
    </div>
  );
}

function SlipRow({ label, amount, currency, lang, negative }: { label: string; amount: number; currency: Currency; lang: Lang; negative?: boolean }) {
  return (
    <tr style={{ borderBottom: `1px solid ${border}` }}>
      <td style={{ padding: "12px 14px", color: ink }}>{label}</td>
      <td style={{ padding: "12px 14px", textAlign: lang === "ar" ? "left" : "right", fontWeight: 700, color: negative ? red : ink }}>
        {formatMoney(amount, currency, lang)}
      </td>
    </tr>
  );
}

// Method label helper (avoid t() dep)
export function paymentMethodTextFor(method: PaymentMethod, lang: Lang): string {
  const map: Record<PaymentMethod, { ar: string; en: string }> = {
    cash: { ar: "نقداً", en: "Cash" },
    bank_transfer: { ar: "حوالة بنكية", en: "Bank transfer" },
    cheque: { ar: "شيك", en: "Cheque" },
    card: { ar: "بطاقة", en: "Card" },
    sham_cash: { ar: "شام كاش", en: "Sham Cash" },
    other: { ar: "أخرى", en: "Other" },
  };
  return lang === "ar" ? map[method].ar : map[method].en;
}
