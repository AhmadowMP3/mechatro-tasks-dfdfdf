
REVOKE ALL ON FUNCTION public.award_task_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_ended_seasons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_ended_seasons() TO service_role;
