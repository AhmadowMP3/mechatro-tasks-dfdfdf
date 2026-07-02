
REVOKE EXECUTE ON FUNCTION public.tasks_guard_member_updates() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins_on_review() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.notify_assignee_on_admin_comment() FROM PUBLIC, authenticated, anon;
