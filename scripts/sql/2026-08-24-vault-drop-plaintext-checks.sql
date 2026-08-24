-- Allow encrypting existing finance rows: the vault blanks plaintext columns,
-- which used to violate the "must have a name/description/amount" CHECKs.
-- Run once on the self-hosted Supabase instance.

ALTER TABLE public.customers        DROP CONSTRAINT IF EXISTS customers_check;
ALTER TABLE public.expenses         DROP CONSTRAINT IF EXISTS expenses_check;
ALTER TABLE public.income_entries   DROP CONSTRAINT IF EXISTS income_entries_check;
ALTER TABLE public.invoice_items    DROP CONSTRAINT IF EXISTS invoice_items_check;
ALTER TABLE public.expenses         DROP CONSTRAINT IF EXISTS expenses_amount_check;
ALTER TABLE public.income_entries   DROP CONSTRAINT IF EXISTS income_entries_amount_check;
ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_amount_check;
ALTER TABLE public.fx_rates         DROP CONSTRAINT IF EXISTS fx_rates_syp_per_usd_check;
ALTER TABLE public.payroll_periods  DROP CONSTRAINT IF EXISTS payroll_periods_month_check;

NOTIFY pgrst, 'reload schema';
