
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'member',
  email text,
  full_name text,
  expires_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  used_at timestamptz,
  used_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX invites_token_idx ON public.invites(token);
CREATE INDEX invites_created_at_idx ON public.invites(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view invites"
  ON public.invites FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert invites"
  ON public.invites FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update invites"
  ON public.invites FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete invites"
  ON public.invites FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Attach the existing audit trigger so invite lifecycle events flow into the activity log.
CREATE TRIGGER invites_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('invite');
