
DO $$ BEGIN
  CREATE TYPE public.backup_request_status AS ENUM ('pending','approved','rejected','completed','failed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.backup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.backup_request_status NOT NULL DEFAULT 'pending',
  requested_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NULL,
  result_file text NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX backup_requests_status_idx ON public.backup_requests(status, requested_at DESC);

GRANT SELECT, UPDATE ON public.backup_requests TO authenticated;
GRANT ALL ON public.backup_requests TO service_role;

ALTER TABLE public.backup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master admins read backup requests"
  ON public.backup_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_master_admin = true));

CREATE POLICY "master admins update backup requests"
  ON public.backup_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_master_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_master_admin = true));

CREATE TRIGGER set_backup_requests_updated_at
  BEFORE UPDATE ON public.backup_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
