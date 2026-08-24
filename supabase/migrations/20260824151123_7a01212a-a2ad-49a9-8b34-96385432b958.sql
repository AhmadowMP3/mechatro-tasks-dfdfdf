REVOKE ALL ON FUNCTION public.settle_task_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_task_points(uuid) TO service_role;