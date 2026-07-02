
CREATE TABLE public.references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  url text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  icon text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.references TO authenticated;
GRANT ALL ON public.references TO service_role;

ALTER TABLE public.references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any authenticated user can view references"
  ON public.references FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and managers can insert references"
  ON public.references FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update references"
  ON public.references FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can delete references"
  ON public.references FOR DELETE
  TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER references_set_updated_at
  BEFORE UPDATE ON public.references
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX references_pinned_created_idx ON public.references (pinned DESC, created_at DESC);
CREATE INDEX references_category_idx ON public.references (category);
