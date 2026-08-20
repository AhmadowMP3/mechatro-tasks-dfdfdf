CREATE TABLE IF NOT EXISTS public.drive_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  client_email TEXT,
  folder_id TEXT,
  folder_name TEXT,
  sa_json_enc TEXT,
  connected_at TIMESTAMPTZ,
  connected_by UUID,
  last_error TEXT
);

REVOKE ALL ON public.drive_config FROM anon, authenticated;
GRANT ALL ON public.drive_config TO service_role;

ALTER TABLE public.drive_config ENABLE ROW LEVEL SECURITY;