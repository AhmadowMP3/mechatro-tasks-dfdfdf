/**
 * Which finance tables live in the encrypted vault, and which structural
 * columns stay readable in the database.
 *
 * Only ids, parent links and row timestamps stay plain — every business value
 * (amounts, names, dates, statuses, notes) is inside the `enc` blob.
 */
export type VaultTable =
  | "customers"
  | "invoices"
  | "invoice_items"
  | "invoice_payments"
  | "expenses"
  | "expense_categories"
  | "income_entries"
  | "subscriptions_income"
  | "subscriptions_expense"
  | "payroll_periods"
  | "payroll_entries"
  | "member_salary_settings"
  | "fx_rates"
  | "financial_settings";

export type VaultTableConfig = {
  /** Primary key column used for updates/deletes. */
  pk: string;
  /** Columns that remain plaintext in the database. */
  keep: string[];
};

export const VAULT_TABLES: Record<VaultTable, VaultTableConfig> = {
  customers: { pk: "id", keep: ["id", "created_at", "updated_at"] },
  invoices: { pk: "id", keep: ["id", "created_at", "updated_at"] },
  invoice_items: { pk: "id", keep: ["id", "invoice_id"] },
  invoice_payments: { pk: "id", keep: ["id", "invoice_id", "created_at"] },
  expenses: { pk: "id", keep: ["id", "created_at", "updated_at"] },
  expense_categories: { pk: "id", keep: ["id", "created_at"] },
  income_entries: { pk: "id", keep: ["id", "created_at", "updated_at"] },
  subscriptions_income: { pk: "id", keep: ["id", "created_at", "updated_at"] },
  subscriptions_expense: { pk: "id", keep: ["id", "created_at", "updated_at"] },
  payroll_periods: { pk: "id", keep: ["id", "created_at", "updated_at"] },
  payroll_entries: { pk: "id", keep: ["id", "period_id", "created_at", "updated_at"] },
  member_salary_settings: { pk: "user_id", keep: ["user_id", "created_at", "updated_at"] },
  fx_rates: { pk: "id", keep: ["id", "created_at"] },
  financial_settings: { pk: "id", keep: ["id", "invoice_next_number", "updated_at"] },
};

export const VAULT_TABLE_NAMES = Object.keys(VAULT_TABLES) as VaultTable[];

export function isVaultTable(name: string): name is VaultTable {
  return name in VAULT_TABLES;
}
