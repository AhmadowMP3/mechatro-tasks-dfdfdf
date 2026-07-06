import type { Database } from "@/integrations/supabase/types";

export type Currency = Database["public"]["Enums"]["currency_code"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ExpenseStatus = Database["public"]["Enums"]["expense_status"];

export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];
export type InvoicePayment = Database["public"]["Tables"]["invoice_payments"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type ExpenseCategory = Database["public"]["Tables"]["expense_categories"]["Row"];
export type IncomeEntry = Database["public"]["Tables"]["income_entries"]["Row"];
export type FxRate = Database["public"]["Tables"]["fx_rates"]["Row"];
export type FinancialSettings = Database["public"]["Tables"]["financial_settings"]["Row"];
export type MemberSalarySettings = Database["public"]["Tables"]["member_salary_settings"]["Row"];
export type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];
export type PayrollEntry = Database["public"]["Tables"]["payroll_entries"]["Row"];
export type SubscriptionExpense = Database["public"]["Tables"]["subscriptions_expense"]["Row"];
export type SubscriptionIncome = Database["public"]["Tables"]["subscriptions_income"]["Row"];
export type SubscriptionCycle = Database["public"]["Enums"]["subscription_cycle"];
export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
export type PayrollPeriodStatus = Database["public"]["Enums"]["payroll_period_status"];

export function subscriptionCycleKey(c: SubscriptionCycle): "cycleMonthly" | "cycleQuarterly" | "cycleSemiannual" | "cycleAnnual" {
  switch (c) {
    case "monthly": return "cycleMonthly";
    case "quarterly": return "cycleQuarterly";
    case "semiannual": return "cycleSemiannual";
    case "annual": return "cycleAnnual";
  }
}

export function payrollStatusKey(s: PayrollPeriodStatus): "payrollDraft" | "payrollFinalized" | "payrollPaid" {
  switch (s) {
    case "draft": return "payrollDraft";
    case "finalized": return "payrollFinalized";
    case "paid": return "payrollPaid";
  }
}

export function monthLabel(month: number, lang: "ar" | "en"): string {
  const ar = ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران","تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"];
  const en = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return (lang === "ar" ? ar : en)[Math.max(0, Math.min(11, month - 1))];
}

/** Format money with thousands separators, Arabic-Indic digits when RTL. */
export function formatMoney(amount: number | string | null | undefined, currency: Currency, lang: "ar" | "en" = "en"): string {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const parts = abs.toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const raw = `${isNegative ? "-" : ""}${intPart}.${parts[1]}`;
  const withLocale = lang === "ar" ? raw.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d, 10)]) : raw;
  const sym = currency === "USD" ? "$" : (lang === "ar" ? "ل.س" : "SYP");
  return currency === "USD" ? `${sym}${withLocale}` : `${withLocale} ${sym}`;
}

/** Convert one currency to another using the given SYP/USD rate. Returns the amount unchanged if already in target currency. */
export function convertAmount(amount: number, fromCurrency: Currency, toCurrency: Currency, sypPerUsd: number): number {
  if (fromCurrency === toCurrency) return amount;
  if (sypPerUsd <= 0) return amount;
  if (fromCurrency === "USD" && toCurrency === "SYP") return amount * sypPerUsd;
  if (fromCurrency === "SYP" && toCurrency === "USD") return amount / sypPerUsd;
  return amount;
}

/** Recompute an invoice line total: (qty * unit_price) - discount. */
export function lineTotal(quantity: number, unitPrice: number, discount: number): number {
  return Math.max(0, quantity * unitPrice - discount);
}

/** Recompute invoice totals from its items. */
export function computeInvoiceTotals(
  items: Array<{ quantity: number; unit_price: number; discount_amount: number }>,
  invoiceDiscount: number,
  taxRate: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce((sum, it) => sum + lineTotal(it.quantity, it.unit_price, it.discount_amount), 0);
  const afterDiscount = Math.max(0, subtotal - invoiceDiscount);
  const taxAmount = (afterDiscount * taxRate) / 100;
  return { subtotal, taxAmount, total: afterDiscount + taxAmount };
}

export function invoiceStatusColor(status: InvoiceStatus): { bg: string; fg: string } {
  switch (status) {
    case "draft": return { bg: "rgba(107,114,128,.15)", fg: "#9CA3AF" };
    case "issued": return { bg: "rgba(59,130,246,.15)", fg: "#60A5FA" };
    case "partially_paid": return { bg: "rgba(245,158,11,.15)", fg: "#FBBF24" };
    case "paid": return { bg: "rgba(80,200,120,.15)", fg: "#50C878" };
    case "overdue": return { bg: "rgba(240,103,106,.15)", fg: "#F0676A" };
    case "void": return { bg: "rgba(107,114,128,.15)", fg: "#6B7280" };
  }
}

export function invoiceStatusKey(status: InvoiceStatus): "invoiceDraft" | "invoiceIssued" | "invoicePartiallyPaid" | "invoicePaid" | "invoiceOverdue" | "invoiceVoid" {
  switch (status) {
    case "draft": return "invoiceDraft";
    case "issued": return "invoiceIssued";
    case "partially_paid": return "invoicePartiallyPaid";
    case "paid": return "invoicePaid";
    case "overdue": return "invoiceOverdue";
    case "void": return "invoiceVoid";
  }
}

export function paymentMethodKey(m: PaymentMethod): "methodCash" | "methodBankTransfer" | "methodCheque" | "methodCard" | "methodShamCash" | "methodOther" {
  switch (m) {
    case "cash": return "methodCash";
    case "bank_transfer": return "methodBankTransfer";
    case "cheque": return "methodCheque";
    case "card": return "methodCard";
    case "sham_cash": return "methodShamCash";
    case "other": return "methodOther";
  }
}
