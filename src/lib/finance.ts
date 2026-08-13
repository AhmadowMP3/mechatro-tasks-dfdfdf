import type { Database } from "@/integrations/supabase/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

/**
 * Finance columns are nullable in the database because every value now lives
 * inside the encrypted `enc` payload. The vault layer always hands back fully
 * populated records, so we restore the original non-null shape here.
 */
type Req<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };

export type Currency = Database["public"]["Enums"]["currency_code"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ExpenseStatus = Database["public"]["Enums"]["expense_status"];

export type Customer = Req<Row<"customers">, "default_currency" | "active">;
export type Invoice = Req<
  Row<"invoices">,
  "number" | "customer_id" | "issue_date" | "currency" | "subtotal" | "discount_amount" | "tax_rate" | "tax_amount" | "total" | "amount_paid" | "status"
>;
export type InvoiceItem = Req<Row<"invoice_items">, "quantity" | "unit_price" | "discount_amount" | "line_total" | "sort_order">;
export type InvoicePayment = Req<Row<"invoice_payments">, "amount" | "currency" | "paid_at" | "method">;
export type Expense = Req<Row<"expenses">, "expense_date" | "amount" | "currency" | "method" | "status">;
export type ExpenseCategory = Req<Row<"expense_categories">, "name_ar" | "name_en" | "active" | "sort_order">;
export type IncomeEntry = Req<Row<"income_entries">, "income_date" | "amount" | "currency" | "method">;
export type FxRate = Req<Row<"fx_rates">, "effective_date" | "syp_per_usd">;
export type FinancialSettings = Req<
  Row<"financial_settings">,
  "default_tax_rate" | "default_currency" | "invoice_number_prefix" | "invoice_next_number"
>;
export type MemberSalarySettings = Req<
  Row<"member_salary_settings">,
  "base_salary" | "currency" | "transport_allowance" | "other_fixed_allowance" | "points_bonus_rate"
>;
export type PayrollPeriod = Req<Row<"payroll_periods">, "year" | "month" | "status">;
export type PayrollEntry = Req<
  Row<"payroll_entries">,
  "currency" | "base_salary" | "transport_allowance" | "other_allowance" | "points_bonus" | "streak_bonus" | "manual_bonus" | "deductions" | "net_amount" | "points_snapshot" | "tasks_done_snapshot"
>;
export type SubscriptionExpense = Req<
  Row<"subscriptions_expense">,
  "name" | "cycle" | "amount" | "currency" | "next_renewal_date" | "reminder_days" | "status" | "auto_create_expense"
>;
export type SubscriptionIncome = Req<
  Row<"subscriptions_income">,
  "customer_id" | "plan_name" | "cycle" | "amount" | "currency" | "start_date" | "next_invoice_date" | "status" | "auto_create_invoice" | "reminder_days"
>;
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
  const withLocale = raw;
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
