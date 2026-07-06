GRANT EXECUTE ON FUNCTION private.is_master_admin(uuid) TO authenticated, service_role;
GRANT INSERT ON public.backup_requests TO authenticated;