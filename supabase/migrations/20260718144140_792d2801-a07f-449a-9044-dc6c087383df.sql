
-- Seed the singleton financial_settings row if missing, and harden next_invoice_number
-- so it self-heals when the row is absent.
INSERT INTO public.financial_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

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

  -- Ensure the singleton row exists (self-heal).
  INSERT INTO public.financial_settings (id)
  VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.financial_settings
     SET invoice_next_number = COALESCE(invoice_next_number, 1) + 1,
         updated_at = now()
   WHERE id = true
   RETURNING COALESCE(invoice_number_prefix, 'INV'), COALESCE(invoice_next_number, 1) - 1
        INTO v_prefix, v_num;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_num::text, 4, '0');
END;
$$;
