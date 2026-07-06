
-- 1) share_links: add password_salt column for salted PBKDF2 hashing.
--    Invalidate any existing weak (unsalted SHA-256) password hashes so
--    the master admin must re-set them under the new scheme.
ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS password_salt TEXT;

UPDATE public.share_links
   SET password_hash = NULL, password_salt = NULL
 WHERE password_hash IS NOT NULL AND password_salt IS NULL;

-- 2) app_config: restrict SELECT to admins only (was: any authenticated).
DROP POLICY IF EXISTS "app_config readable by authenticated" ON public.app_config;
CREATE POLICY "app_config readable by admins"
  ON public.app_config
  FOR SELECT
  TO authenticated
  USING (private.is_admin(auth.uid()));

-- 3) Remove sensitive "invites" table from realtime publication so invite
--    tokens/password hashes are not broadcast to subscribers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invites'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.invites';
  END IF;
END$$;

-- 4) Revoke EXECUTE on SECURITY DEFINER helpers that should not be
--    directly callable by the Data API. These are used internally
--    (as RLS helpers or trigger functions) and don't need public execute.
REVOKE EXECUTE ON FUNCTION public.can_view_note(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_note_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_paid() FROM PUBLIC, anon, authenticated;
-- next_invoice_number is intentionally callable by authenticated finance admins (RPC).
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon;
-- resolve_login_email must remain callable by anon (login by username) — no revoke.

-- 5) Fix mutable search_path on user-defined function advance_subscription_date.
ALTER FUNCTION public.advance_subscription_date(date, public.subscription_cycle)
  SET search_path = public;
