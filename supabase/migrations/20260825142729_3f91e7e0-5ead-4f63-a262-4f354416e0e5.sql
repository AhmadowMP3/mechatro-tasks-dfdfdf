ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS 'SAR';

ALTER TABLE public.fx_rates ADD COLUMN IF NOT EXISTS sar_per_usd numeric DEFAULT 3.75;

UPDATE public.fx_rates SET sar_per_usd = 3.75 WHERE sar_per_usd IS NULL;