ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recovery_email text,
  ADD COLUMN IF NOT EXISTS recovery_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_recovery_email_idx
  ON public.profiles (lower(recovery_email));

CREATE OR REPLACE FUNCTION public.find_recovery_account(p_query text)
RETURNS TABLE (user_id uuid, recovery_email text, full_name text, recovery_sent_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.recovery_email, p.full_name, p.recovery_sent_at
    FROM public.profiles p
   WHERE p.status = 'active'
     AND p.recovery_email IS NOT NULL
     AND (
       lower(p.username::text)      = lower(trim(p_query))
       OR lower(p.full_name)        = lower(trim(p_query))
       OR lower(p.recovery_email)   = lower(trim(p_query))
       OR lower(p.email)            = lower(trim(p_query))
     )
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_recovery_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_recovery_account(text) TO service_role;