REVOKE ALL ON FUNCTION public.team_pulse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_pulse() TO authenticated;