-- Leaderboard shared visibility (self-hosted sync)
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.leaderboard()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  job_title text,
  total_points integer,
  current_streak integer,
  longest_streak integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.job_title,
         p.total_points, p.current_streak, p.longest_streak
  FROM public.profiles p
  WHERE p.active IS NOT FALSE AND p.status <> 'suspended'
  ORDER BY p.total_points DESC, p.full_name ASC
$$;

REVOKE ALL ON FUNCTION public.leaderboard() FROM public;
GRANT EXECUTE ON FUNCTION public.leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard() TO service_role;

-- Make sure PostgREST picks up the new function immediately.
NOTIFY pgrst, 'reload schema';
