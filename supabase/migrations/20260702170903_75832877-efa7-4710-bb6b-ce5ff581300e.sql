
REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, public.permission_key) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, public.permission_key) TO authenticated, service_role;
