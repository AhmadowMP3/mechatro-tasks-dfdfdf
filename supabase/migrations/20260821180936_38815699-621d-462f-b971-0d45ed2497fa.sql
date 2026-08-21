CREATE TABLE IF NOT EXISTS public.backup_error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  message text NOT NULL,
  file text,
  folder_id text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.backup_error_log TO authenticated;
GRANT ALL ON public.backup_error_log TO service_role;

ALTER TABLE public.backup_error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master admin reads backup errors" ON public.backup_error_log;
CREATE POLICY "master admin reads backup errors"
ON public.backup_error_log FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_master_admin));

DROP POLICY IF EXISTS "master admin clears backup errors" ON public.backup_error_log;
CREATE POLICY "master admin clears backup errors"
ON public.backup_error_log FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_master_admin));

CREATE INDEX IF NOT EXISTS backup_error_log_created_idx ON public.backup_error_log (created_at DESC);