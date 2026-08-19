
CREATE OR REPLACE FUNCTION private.is_task_assignee(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = _task_id AND (t.assignee_id = _user_id OR t.created_by = _user_id))
      OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = _task_id AND ta.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION private.can_view_task(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_admin(_user_id)
      OR private.is_task_assignee(_task_id, _user_id)
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = _task_id AND t.project_id IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM public.tasks o WHERE o.project_id = t.project_id AND o.assignee_id = _user_id)
            OR EXISTS (
              SELECT 1 FROM public.task_assignees ta
              JOIN public.tasks o ON o.id = ta.task_id
              WHERE o.project_id = t.project_id AND ta.user_id = _user_id
            )
          )
      );
$$;

DROP POLICY IF EXISTS tasks_assignee_read ON public.tasks;
CREATE POLICY tasks_member_read ON public.tasks FOR SELECT TO authenticated
  USING (private.can_view_task(id, auth.uid()));

DROP POLICY IF EXISTS tasks_assignee_update ON public.tasks;
CREATE POLICY tasks_assignee_update ON public.tasks FOR UPDATE TO authenticated
  USING (private.is_task_assignee(id, auth.uid()))
  WITH CHECK (private.is_task_assignee(id, auth.uid()));

DROP POLICY IF EXISTS task_assignees_self_read ON public.task_assignees;
CREATE POLICY task_assignees_self_read ON public.task_assignees FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS task_comments_assignee_read ON public.task_comments;
CREATE POLICY task_comments_assignee_read ON public.task_comments FOR SELECT TO authenticated
  USING (private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS task_comments_assignee_insert ON public.task_comments;
CREATE POLICY task_comments_assignee_insert ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND private.is_task_assignee(task_id, auth.uid()));

DROP POLICY IF EXISTS task_files_assignee_read ON public.task_files;
CREATE POLICY task_files_assignee_read ON public.task_files FOR SELECT TO authenticated
  USING (private.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS task_files_assignee_insert ON public.task_files;
CREATE POLICY task_files_assignee_insert ON public.task_files FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND private.is_task_assignee(task_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.team_pulse()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'done_this_week', (SELECT count(*) FROM public.tasks WHERE status = 'done' AND completed_at >= date_trunc('week', now())),
    'open_total', (SELECT count(*) FROM public.tasks WHERE status <> 'done'),
    'active_members', (SELECT count(*) FROM public.profiles WHERE active AND status = 'active'),
    'team_points', (SELECT coalesce(sum(total_points), 0) FROM public.profiles WHERE active)
  );
$$;

GRANT EXECUTE ON FUNCTION public.team_pulse() TO authenticated;
