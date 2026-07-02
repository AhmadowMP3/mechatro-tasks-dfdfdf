
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  allowed_pages text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  max_uses int,
  use_count int NOT NULL DEFAULT 0,
  password_hash text,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO authenticated;
GRANT ALL ON public.share_links TO service_role;

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master admin manages share links"
  ON public.share_links
  FOR ALL
  TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

CREATE TRIGGER share_links_set_updated_at
  BEFORE UPDATE ON public.share_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER share_links_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.share_links
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('share_link');
