
-- Phase 2: Payroll + Subscriptions

CREATE TYPE public.payroll_period_status AS ENUM ('draft','finalized','paid');
CREATE TYPE public.subscription_cycle AS ENUM ('monthly','quarterly','semiannual','annual');
CREATE TYPE public.subscription_status AS ENUM ('active','paused','canceled');

-- Member salary settings
CREATE TABLE public.member_salary_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_salary NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'SYP',
  transport_allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_fixed_allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
  points_bonus_rate NUMERIC(18,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_salary_settings TO authenticated;
GRANT ALL ON public.member_salary_settings TO service_role;
ALTER TABLE public.member_salary_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance manage salary settings" ON public.member_salary_settings
  FOR ALL TO authenticated USING (private.is_finance_admin(auth.uid())) WITH CHECK (private.is_finance_admin(auth.uid()));
CREATE POLICY "member reads own salary settings" ON public.member_salary_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_mss_updated BEFORE UPDATE ON public.member_salary_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payroll periods
CREATE TABLE public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status public.payroll_period_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  finalized_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance manages periods" ON public.payroll_periods
  FOR ALL TO authenticated USING (private.is_finance_admin(auth.uid())) WITH CHECK (private.is_finance_admin(auth.uid()));
CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payroll entries
CREATE TABLE public.payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL DEFAULT 'SYP',
  base_salary NUMERIC(18,2) NOT NULL DEFAULT 0,
  transport_allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
  points_bonus NUMERIC(18,2) NOT NULL DEFAULT 0,
  streak_bonus NUMERIC(18,2) NOT NULL DEFAULT 0,
  manual_bonus NUMERIC(18,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  points_snapshot INT NOT NULL DEFAULT 0,
  tasks_done_snapshot INT NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  payment_method public.payment_method,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_entries TO authenticated;
GRANT ALL ON public.payroll_entries TO service_role;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance manages entries" ON public.payroll_entries
  FOR ALL TO authenticated USING (private.is_finance_admin(auth.uid())) WITH CHECK (private.is_finance_admin(auth.uid()));
CREATE POLICY "member reads own entries" ON public.payroll_entries
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_pe_updated BEFORE UPDATE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Subscriptions (company outgoing expenses like Adobe, GitHub, Hosting)
CREATE TABLE public.subscriptions_expense (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vendor TEXT,
  category TEXT,
  cycle public.subscription_cycle NOT NULL DEFAULT 'monthly',
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  start_date DATE,
  next_renewal_date DATE NOT NULL,
  reminder_days INT NOT NULL DEFAULT 7,
  status public.subscription_status NOT NULL DEFAULT 'active',
  auto_create_expense BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions_expense TO authenticated;
GRANT ALL ON public.subscriptions_expense TO service_role;
ALTER TABLE public.subscriptions_expense ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance manages sub_exp" ON public.subscriptions_expense
  FOR ALL TO authenticated USING (private.is_finance_admin(auth.uid())) WITH CHECK (private.is_finance_admin(auth.uid()));
CREATE TRIGGER trg_se_updated BEFORE UPDATE ON public.subscriptions_expense
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Subscriptions (incoming client subscriptions)
CREATE TABLE public.subscriptions_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  plan_name TEXT NOT NULL,
  description TEXT,
  cycle public.subscription_cycle NOT NULL DEFAULT 'monthly',
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_invoice_date DATE NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'active',
  auto_create_invoice BOOLEAN NOT NULL DEFAULT false,
  reminder_days INT NOT NULL DEFAULT 7,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions_income TO authenticated;
GRANT ALL ON public.subscriptions_income TO service_role;
ALTER TABLE public.subscriptions_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance manages sub_inc" ON public.subscriptions_income
  FOR ALL TO authenticated USING (private.is_finance_admin(auth.uid())) WITH CHECK (private.is_finance_admin(auth.uid()));
CREATE TRIGGER trg_si_updated BEFORE UPDATE ON public.subscriptions_income
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pe_period ON public.payroll_entries(period_id);
CREATE INDEX idx_pe_user ON public.payroll_entries(user_id);
CREATE INDEX idx_se_renewal ON public.subscriptions_expense(next_renewal_date) WHERE status='active';
CREATE INDEX idx_si_next ON public.subscriptions_income(next_invoice_date) WHERE status='active';

-- Helper to compute next date given cycle
CREATE OR REPLACE FUNCTION public.advance_subscription_date(base_date DATE, c public.subscription_cycle)
RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE c
    WHEN 'monthly' THEN base_date + INTERVAL '1 month'
    WHEN 'quarterly' THEN base_date + INTERVAL '3 months'
    WHEN 'semiannual' THEN base_date + INTERVAL '6 months'
    WHEN 'annual' THEN base_date + INTERVAL '1 year'
  END::date
$$;
