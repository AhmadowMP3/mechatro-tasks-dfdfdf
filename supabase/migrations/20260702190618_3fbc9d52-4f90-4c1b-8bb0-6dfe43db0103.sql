
-- Generic audit function: writes into public.activity_log for any table with
-- a uuid id column. It picks up the row's display title from common columns
-- and, for updates, emits status_changed with {from,to} meta when applicable.
CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       uuid := auth.uid();
  v_action      text;
  v_entity_type text := COALESCE(TG_ARGV[0], TG_TABLE_NAME);
  v_entity_id   uuid;
  v_meta        jsonb := '{}'::jsonb;
  v_title       text;
  v_old         jsonb;
  v_new         jsonb;
  v_from_status text;
  v_to_status   text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_new := to_jsonb(OLD);
    v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_action := 'created';
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_action := 'updated';
  END IF;

  -- entity id
  BEGIN
    v_entity_id := (v_new->>'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_entity_id := NULL;
  END;

  -- display title (first available field)
  v_title := COALESCE(
    v_new->>'title',
    v_new->>'name_en',
    v_new->>'name_ar',
    v_new->>'full_name'
  );
  IF v_title IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('title', v_title);
  END IF;

  -- status transitions (tasks, projects, profiles.status)
  IF TG_OP = 'UPDATE' THEN
    v_from_status := v_old->>'status';
    v_to_status   := v_new->>'status';
    IF v_from_status IS DISTINCT FROM v_to_status THEN
      v_action := 'status_changed';
      v_meta := v_meta || jsonb_build_object('from', v_from_status, 'to', v_to_status);
    END IF;

    -- profiles: role change
    IF TG_TABLE_NAME = 'profiles' THEN
      IF (v_old->>'role') IS DISTINCT FROM (v_new->>'role') THEN
        v_action := 'assigned';
        v_meta := v_meta || jsonb_build_object(
          'from_role', v_old->>'role',
          'to_role',   v_new->>'role'
        );
      ELSIF (v_old->>'active') IS DISTINCT FROM (v_new->>'active') THEN
        v_action := CASE WHEN (v_new->>'active')::bool THEN 'updated' ELSE 'archived' END;
        v_meta := v_meta || jsonb_build_object('active', v_new->>'active');
      ELSE
        -- Skip noisy generic profile updates (avatar, prefs) unless status changed above.
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  END IF;

  -- override actions per table for readability
  IF TG_TABLE_NAME = 'task_comments' AND TG_OP = 'INSERT' THEN v_action := 'commented'; END IF;
  IF TG_TABLE_NAME = 'task_files'    AND TG_OP = 'INSERT' THEN v_action := 'file_added'; END IF;

  -- for comments/files we point the entity to the parent task
  IF TG_TABLE_NAME IN ('task_comments', 'task_files') THEN
    v_entity_type := 'task';
    BEGIN
      v_entity_id := (v_new->>'task_id')::uuid;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, meta)
  VALUES (v_actor, v_action, v_entity_type, v_entity_id, v_meta);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Never block the underlying write because of an audit failure.
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers (drop-if-exists so this migration is re-runnable).
DROP TRIGGER IF EXISTS trg_audit_tasks           ON public.tasks;
DROP TRIGGER IF EXISTS trg_audit_projects        ON public.projects;
DROP TRIGGER IF EXISTS trg_audit_references      ON public."references";
DROP TRIGGER IF EXISTS trg_audit_task_comments   ON public.task_comments;
DROP TRIGGER IF EXISTS trg_audit_task_files      ON public.task_files;
DROP TRIGGER IF EXISTS trg_audit_member_reports  ON public.member_reports;
DROP TRIGGER IF EXISTS trg_audit_profiles        ON public.profiles;

CREATE TRIGGER trg_audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('task');

CREATE TRIGGER trg_audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('project');

CREATE TRIGGER trg_audit_references
  AFTER INSERT OR UPDATE OR DELETE ON public."references"
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('reference');

CREATE TRIGGER trg_audit_task_comments
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('comment');

CREATE TRIGGER trg_audit_task_files
  AFTER INSERT ON public.task_files
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('file');

CREATE TRIGGER trg_audit_member_reports
  AFTER INSERT OR DELETE ON public.member_reports
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('report');

CREATE TRIGGER trg_audit_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('profile');
