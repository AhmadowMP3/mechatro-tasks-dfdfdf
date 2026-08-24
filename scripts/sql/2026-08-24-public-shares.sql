CREATE TABLE IF NOT EXISTS public.public_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ref_id text,
  token text NOT NULL UNIQUE,
  title text,
  lang text NOT NULL DEFAULT 'ar',
  theme text NOT NULL DEFAULT 'dark',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_shares_ref_idx ON public.public_shares (kind, ref_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_shares TO authenticated;
GRANT ALL ON public.public_shares TO service_role;

ALTER TABLE public.public_shares ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_share_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid AND (p.is_master_admin = true OR p.role::text = 'admin')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_share_admin(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "shares_insert_auth" ON public.public_shares;
CREATE POLICY "shares_insert_auth" ON public.public_shares
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "shares_select_own_or_admin" ON public.public_shares;
CREATE POLICY "shares_select_own_or_admin" ON public.public_shares
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_share_admin(auth.uid()));

DROP POLICY IF EXISTS "shares_update_own_or_admin" ON public.public_shares;
CREATE POLICY "shares_update_own_or_admin" ON public.public_shares
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_share_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_share_admin(auth.uid()));

DROP POLICY IF EXISTS "shares_delete_own_or_admin" ON public.public_shares;
CREATE POLICY "shares_delete_own_or_admin" ON public.public_shares
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_share_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_public_share(p_token text)
RETURNS TABLE (token text, kind text, title text, lang text, theme text, payload jsonb, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.token, s.kind, s.title, s.lang, s.theme, s.payload, s.created_at
  FROM public.public_shares s
  WHERE s.token = p_token
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_public_share(text) TO anon, authenticated;