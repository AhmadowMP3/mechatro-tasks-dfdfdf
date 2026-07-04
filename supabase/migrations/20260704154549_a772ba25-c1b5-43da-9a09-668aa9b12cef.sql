
-- Revoke default PUBLIC EXECUTE on SECURITY DEFINER functions and grant back only where needed.

-- Trigger functions: should never be called directly by users
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tasks_guard_member_updates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins_on_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_assignee_on_admin_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_row_change() FROM PUBLIC, anon, authenticated;

-- Admin sync utility: service role only
REVOKE ALL ON FUNCTION public.sync_master_admin() FROM PUBLIC, anon, authenticated;

-- Role-check helpers used by RLS policies: keep callable by authenticated
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_master_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated, service_role;
