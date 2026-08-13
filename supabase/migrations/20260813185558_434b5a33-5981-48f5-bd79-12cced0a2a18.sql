-- 1. Encrypted payload column on every finance table
DO $$
DECLARE t text;
  tabs text[] := ARRAY['customers','invoices','invoice_items','invoice_payments','expenses',
    'expense_categories','income_entries','subscriptions_income','subscriptions_expense',
    'payroll_periods','payroll_entries','member_salary_settings','fx_rates','financial_settings'];
  keep text[] := ARRAY['id','created_at','updated_at','invoice_id','period_id','user_id','invoice_next_number','enc'];
  c record;
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS enc text', t);
    FOR c IN
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t
         AND is_nullable='NO' AND NOT (column_name = ANY(keep))
    LOOP
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', t, c.column_name);
    END LOOP;
  END LOOP;
END $$;

-- 2. Vault metadata (salt + verifier only; never the passphrase)
CREATE TABLE IF NOT EXISTS public.finance_vault_meta (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  kdf_salt text NOT NULL,
  kdf_iterations integer NOT NULL DEFAULT 600000,
  verifier text NOT NULL,
  encrypted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.finance_vault_meta TO authenticated;
GRANT ALL ON public.finance_vault_meta TO service_role;

ALTER TABLE public.finance_vault_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_vault_meta_master ON public.finance_vault_meta;
CREATE POLICY finance_vault_meta_master ON public.finance_vault_meta
  FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid()))
  WITH CHECK (private.is_master_admin(auth.uid()));

DROP TRIGGER IF EXISTS finance_vault_meta_updated_at ON public.finance_vault_meta;
CREATE TRIGGER finance_vault_meta_updated_at BEFORE UPDATE ON public.finance_vault_meta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Server can no longer read amounts/dates: drop value-dependent automation
DROP TRIGGER IF EXISTS trg_invoice_payments_recompute ON public.invoice_payments;
DROP TRIGGER IF EXISTS trg_customers_activity ON public.customers;
DROP TRIGGER IF EXISTS trg_expenses_activity ON public.expenses;
DROP TRIGGER IF EXISTS trg_income_activity ON public.income_entries;
DROP TRIGGER IF EXISTS trg_invoices_activity ON public.invoices;

-- 4. Invoice numbering: plain counter only, formatting happens client-side
CREATE OR REPLACE FUNCTION public.next_invoice_seq()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_num integer;
BEGIN
  IF NOT private.is_finance_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.financial_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
  UPDATE public.financial_settings
     SET invoice_next_number = COALESCE(invoice_next_number, 1) + 1,
         updated_at = now()
   WHERE id = true
   RETURNING COALESCE(invoice_next_number, 1) - 1 INTO v_num;
  RETURN v_num;
END $$;

GRANT EXECUTE ON FUNCTION public.next_invoice_seq() TO authenticated;