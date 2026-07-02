
-- 1) Update member guard: members cannot set status='done'
CREATE OR REPLACE FUNCTION public.tasks_guard_member_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.title            IS DISTINCT FROM OLD.title
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.assignee_id    IS DISTINCT FROM OLD.assignee_id
    OR NEW.project_id     IS DISTINCT FROM OLD.project_id
    OR NEW.priority       IS DISTINCT FROM OLD.priority
    OR NEW.due_date       IS DISTINCT FROM OLD.due_date
    OR NEW.start_date     IS DISTINCT FROM OLD.start_date
    OR NEW.created_by     IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Members can only update task status, progress, and completion';
  END IF;
  IF NEW.status = 'done'::public.task_status AND OLD.status IS DISTINCT FROM 'done'::public.task_status THEN
    RAISE EXCEPTION 'Only admins can mark a task as done. Please submit it for review instead.';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Notify admins when a task moves into 'in_review'
CREATE OR REPLACE FUNCTION public.notify_admins_on_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_id uuid;
  actor_name text;
BEGIN
  IF NEW.status = 'in_review'::public.task_status
     AND (OLD.status IS DISTINCT FROM 'in_review'::public.task_status) THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    FOR admin_id IN
      SELECT id FROM public.profiles
      WHERE (role = 'admin'::public.app_role OR is_master_admin = true)
        AND active = true
    LOOP
      INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
      VALUES (
        admin_id,
        'review_requested',
        'مهمة بانتظار المراجعة',
        'Task awaiting review',
        COALESCE(actor_name, 'Member') || ' → ' || NEW.title,
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_review ON public.tasks;
CREATE TRIGGER trg_notify_admins_on_review
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_review();

-- 3) Notify assignee when an admin comments on their task
CREATE OR REPLACE FUNCTION public.notify_assignee_on_admin_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t_row public.tasks%ROWTYPE;
  actor_name text;
BEGIN
  SELECT * INTO t_row FROM public.tasks WHERE id = NEW.task_id;
  IF t_row.assignee_id IS NULL OR t_row.assignee_id = NEW.author_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_admin(NEW.author_id) THEN
    RETURN NEW;
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.author_id;
  INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
  VALUES (
    t_row.assignee_id,
    'admin_comment',
    'تعليق جديد من المدير',
    'New comment from admin',
    COALESCE(actor_name, 'Admin') || ' → ' || t_row.title,
    t_row.id
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_assignee_on_admin_comment ON public.task_comments;
CREATE TRIGGER trg_notify_assignee_on_admin_comment
AFTER INSERT ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_assignee_on_admin_comment();

REVOKE EXECUTE ON FUNCTION public.tasks_guard_member_updates() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins_on_review() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_assignee_on_admin_comment() FROM anon;
