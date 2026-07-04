GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;