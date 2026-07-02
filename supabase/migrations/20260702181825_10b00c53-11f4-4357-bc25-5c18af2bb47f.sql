
REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_master_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_guard_member_updates() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
