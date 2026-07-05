
-- ========== ROLE EXTENSION ==========
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_finance_admin BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.is_finance_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (is_master_admin = true OR is_finance_admin = true OR role = 'admin')
      AND (status = 'active' OR is_master_admin = true)
  );
$$;

-- ========== ENUMS ==========
DO $$ BEGIN
  CREATE TYPE public.currency_code AS ENUM ('SYP','USD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft','issued','partially_paid','paid','overdue','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','cheque','card','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.expense_status AS ENUM ('pending','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== FINANCIAL SETTINGS ==========
CREATE TABLE IF NOT EXISTS public.financial_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  company_name_ar TEXT,
  company_name_en TEXT,
  company_address_ar TEXT,
  company_address_en TEXT,
  company_phone TEXT,
  company_email TEXT,
  tax_number TEXT,
  bank_details_ar TEXT,
  bank_details_en TEXT,
  default_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  default_currency public.currency_code NOT NULL DEFAULT 'SYP',
  invoice_number_prefix TEXT NOT NULL DEFAULT 'INV',
  invoice_next_number INTEGER NOT NULL DEFAULT 1,
  invoice_terms_ar TEXT,
  invoice_terms_en TEXT,
  signature_url TEXT,
  stamp_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_settings TO authenticated;
GRANT ALL ON public.financial_settings TO service_role;
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_settings_read ON public.financial_settings FOR SELECT TO authenticated
  USING (private.is_finance_admin(auth.uid()));
CREATE POLICY financial_settings_manage ON public.financial_settings FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

INSERT INTO public.financial_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ========== FX RATES ==========
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date DATE NOT NULL,
  syp_per_usd NUMERIC(18,4) NOT NULL CHECK (syp_per_usd > 0),
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(effective_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY fx_rates_all ON public.fx_rates FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

-- ========== CUSTOMERS ==========
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT,
  name_en TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_number TEXT,
  default_currency public.currency_code NOT NULL DEFAULT 'SYP',
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (coalesce(name_ar,'') <> '' OR coalesce(name_en,'') <> '')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_all ON public.customers FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== EXPENSE CATEGORIES ==========
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY expense_categories_read ON public.expense_categories FOR SELECT TO authenticated
  USING (private.is_finance_admin(auth.uid()));
CREATE POLICY expense_categories_manage ON public.expense_categories FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

INSERT INTO public.expense_categories (name_ar, name_en, color, icon, sort_order) VALUES
  ('رواتب','Salaries','#3B82F6','Users',10),
  ('إيجار','Rent','#F59E0B','Home',20),
  ('معدات','Equipment','#10B981','Package',30),
  ('برمجيات','Software','#8B5CF6','Cpu',40),
  ('تسويق','Marketing','#EC4899','Megaphone',50),
  ('مواصلات','Transport','#06B6D4','Car',60),
  ('ضيافة','Hospitality','#F97316','Coffee',70),
  ('اتصالات','Communications','#14B8A6','Phone',80),
  ('أخرى','Other','#6B7280','MoreHorizontal',999)
ON CONFLICT DO NOTHING;

-- ========== INVOICES ==========
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  due_date DATE,
  currency public.currency_code NOT NULL DEFAULT 'SYP',
  exchange_rate_to_usd NUMERIC(18,6),
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  notes_ar TEXT,
  notes_en TEXT,
  terms_ar TEXT,
  terms_en TEXT,
  pdf_path TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_all ON public.invoices FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS invoices_customer_idx ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(status);
CREATE INDEX IF NOT EXISTS invoices_issue_date_idx ON public.invoices(issue_date DESC);

-- ========== INVOICE ITEMS ==========
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description_ar TEXT,
  description_en TEXT,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK (coalesce(description_ar,'') <> '' OR coalesce(description_en,'') <> '')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_items_all ON public.invoice_items FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items(invoice_id);

-- ========== INVOICE PAYMENTS ==========
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL,
  exchange_rate_to_usd NUMERIC(18,6),
  paid_at DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  reference TEXT,
  proof_path TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_payments_all ON public.invoice_payments FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON public.invoice_payments(invoice_id);

CREATE OR REPLACE FUNCTION public.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid NUMERIC(18,2);
  v_total NUMERIC(18,2);
  v_status public.invoice_status;
  v_due DATE;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.invoice_payments WHERE invoice_id = v_invoice_id;
  SELECT total, due_date, status INTO v_total, v_due, v_status FROM public.invoices WHERE id = v_invoice_id;
  IF v_status = 'draft' OR v_status = 'void' THEN
    UPDATE public.invoices SET amount_paid = v_paid WHERE id = v_invoice_id;
  ELSE
    IF v_paid >= v_total AND v_total > 0 THEN
      v_status := 'paid';
    ELSIF v_paid > 0 THEN
      v_status := 'partially_paid';
    ELSIF v_due IS NOT NULL AND v_due < (now() AT TIME ZONE 'UTC')::date THEN
      v_status := 'overdue';
    ELSE
      v_status := 'issued';
    END IF;
    UPDATE public.invoices SET amount_paid = v_paid, status = v_status WHERE id = v_invoice_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_invoice_payments_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_paid();

-- ========== EXPENSES ==========
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  vendor TEXT,
  description_ar TEXT,
  description_en TEXT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'SYP',
  exchange_rate_to_usd NUMERIC(18,6),
  method public.payment_method NOT NULL DEFAULT 'cash',
  status public.expense_status NOT NULL DEFAULT 'paid',
  reference TEXT,
  receipt_path TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (coalesce(description_ar,'') <> '' OR coalesce(description_en,'') <> '')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY expenses_all ON public.expenses FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS expenses_date_idx ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON public.expenses(category_id);
CREATE INDEX IF NOT EXISTS expenses_project_idx ON public.expenses(project_id);

-- ========== DIRECT INCOME ==========
CREATE TABLE IF NOT EXISTS public.income_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  category TEXT,
  source TEXT,
  description_ar TEXT,
  description_en TEXT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'SYP',
  exchange_rate_to_usd NUMERIC(18,6),
  method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (coalesce(description_ar,'') <> '' OR coalesce(description_en,'') <> '')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_entries TO authenticated;
GRANT ALL ON public.income_entries TO service_role;
ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY income_entries_all ON public.income_entries FOR ALL TO authenticated
  USING (private.is_finance_admin(auth.uid()))
  WITH CHECK (private.is_finance_admin(auth.uid()));

CREATE TRIGGER trg_income_updated_at BEFORE UPDATE ON public.income_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS income_date_idx ON public.income_entries(income_date DESC);

-- ========== INVOICE NUMBER GENERATOR ==========
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix TEXT;
  v_num INTEGER;
  v_year INTEGER := EXTRACT(YEAR FROM now())::int;
BEGIN
  IF NOT private.is_finance_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.financial_settings
     SET invoice_next_number = invoice_next_number + 1,
         updated_at = now()
   WHERE id = true
   RETURNING invoice_number_prefix, invoice_next_number - 1 INTO v_prefix, v_num;
  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_num::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;

-- ========== ACTIVITY LOG TRIGGERS ==========
CREATE TRIGGER trg_customers_activity AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('customer');
CREATE TRIGGER trg_invoices_activity AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('invoice');
CREATE TRIGGER trg_expenses_activity AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('expense');
CREATE TRIGGER trg_income_activity AFTER INSERT OR UPDATE OR DELETE ON public.income_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('income');
