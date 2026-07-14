
REVOKE ALL ON FUNCTION public.award_points_to_user(public.tasks, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points_to_user(public.tasks, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.award_points_to_user(public.tasks, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_points_to_user(public.tasks, uuid, integer) TO service_role;
