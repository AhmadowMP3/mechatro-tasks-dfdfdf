-- Finance vault diagnostics & reset (self-hosted Supabase)
-- Run the READ block first. Only uncomment the RESET block after you accept
-- that every encrypted finance record becomes permanently unreadable.

-- ============================ READ ONLY =====================================

-- 1) Vault key record (does it exist, when was it written?)
select id, kdf_iterations, length(kdf_salt) as salt_len, length(verifier) as verifier_len,
       encrypted_at, created_at, updated_at
  from public.finance_vault_meta;

-- 2) How many records are actually encrypted per finance table
select 'customers' as tbl, count(*) as total, count(enc) as encrypted from public.customers
union all select 'invoices', count(*), count(enc) from public.invoices
union all select 'invoice_items', count(*), count(enc) from public.invoice_items
union all select 'invoice_payments', count(*), count(enc) from public.invoice_payments
union all select 'expenses', count(*), count(enc) from public.expenses
union all select 'expense_categories', count(*), count(enc) from public.expense_categories
union all select 'income_entries', count(*), count(enc) from public.income_entries
union all select 'subscriptions_income', count(*), count(enc) from public.subscriptions_income
union all select 'subscriptions_expense', count(*), count(enc) from public.subscriptions_expense
union all select 'payroll_periods', count(*), count(enc) from public.payroll_periods
union all select 'payroll_entries', count(*), count(enc) from public.payroll_entries
union all select 'member_salary_settings', count(*), count(enc) from public.member_salary_settings
union all select 'fx_rates', count(*), count(enc) from public.fx_rates
union all select 'financial_settings', count(*), count(enc) from public.financial_settings
order by encrypted desc, tbl;

-- ======================= DESTRUCTIVE RESET (commented) =======================
-- Forget the passphrase so the app shows the "create vault" screen again.
--
-- begin;
--   -- a) discard unreadable encrypted rows (skip this if encrypted count is 0)
--   delete from public.invoice_items       where enc is not null;
--   delete from public.invoice_payments    where enc is not null;
--   delete from public.invoices            where enc is not null;
--   delete from public.expenses            where enc is not null;
--   delete from public.expense_categories  where enc is not null;
--   delete from public.income_entries      where enc is not null;
--   delete from public.subscriptions_income  where enc is not null;
--   delete from public.subscriptions_expense where enc is not null;
--   delete from public.payroll_entries     where enc is not null;
--   delete from public.payroll_periods     where enc is not null;
--   delete from public.member_salary_settings where enc is not null;
--   delete from public.fx_rates            where enc is not null;
--   delete from public.customers           where enc is not null;
--   update public.financial_settings set enc = null where enc is not null;
--
--   -- b) drop the vault key itself
--   delete from public.finance_vault_meta;
-- commit;
