-- Saudi Riyal support (run once on the self-hosted Supabase instance).
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'currency_code' AND e.enumlabel = 'SAR'
  ) THEN
    ALTER TYPE public.currency_code ADD VALUE 'SAR';
  END IF;
END $$;

ALTER TABLE public.fx_rates
  ADD COLUMN IF NOT EXISTS sar_per_usd numeric NOT NULL DEFAULT 3.75;

COMMENT ON COLUMN public.fx_rates.sar_per_usd IS 'Saudi Riyal units per 1 USD (official peg 3.75).';
