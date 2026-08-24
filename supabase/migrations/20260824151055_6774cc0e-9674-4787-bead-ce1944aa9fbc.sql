-- Central, idempotent settlement of task points
CREATE OR REPLACE FUNCTION public.settle_task_points(p_task_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.tasks;
  v_row RECORD;
  v_award INTEGER;
  v_has_awards BOOLEAN;
  v_any_awarded BOOLEAN;
  v_total INTEGER := 0;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF v_task.id IS NULL OR v_task.status IS DISTINCT FROM 'done'::public.task_status THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.task_point_awards WHERE task_id = p_task_id AND points > 0),
         EXISTS (SELECT 1 FROM public.task_point_awards WHERE task_id = p_task_id AND awarded_at IS NOT NULL)
    INTO v_has_awards, v_any_awarded;

  IF v_has_awards THEN
    -- The task was previously credited through the legacy single-assignee path
    -- and a split has been added afterwards: undo the legacy credit first.
    IF NOT v_any_awarded
       AND v_task.points_awarded_at IS NOT NULL
       AND COALESCE(v_task.points_awarded_amount, 0) > 0
       AND v_task.assignee_id IS NOT NULL THEN
      UPDATE public.profiles
         SET total_points = GREATEST(0, total_points - v_task.points_awarded_amount)
       WHERE id = v_task.assignee_id;
      UPDATE public.tasks
         SET points_awarded_amount = 0, points_awarded_at = NULL
       WHERE id = p_task_id;
      v_task.points_awarded_amount := 0;
      v_task.points_awarded_at := NULL;
    END IF;

    FOR v_row IN
      SELECT id, user_id, points FROM public.task_point_awards
       WHERE task_id = p_task_id AND awarded_at IS NULL AND points > 0
    LOOP
      v_award := public.award_points_to_user(v_task, v_row.user_id, v_row.points);
      UPDATE public.task_point_awards
         SET awarded_amount = v_award, awarded_at = now()
       WHERE id = v_row.id;
      v_total := v_total + v_award;
    END LOOP;

    UPDATE public.tasks
       SET points_awarded_at = COALESCE(points_awarded_at, now()),
           points_awarded_amount = (
             SELECT COALESCE(SUM(COALESCE(awarded_amount, 0)), 0)
               FROM public.task_point_awards
              WHERE task_id = p_task_id AND awarded_at IS NOT NULL
           )
     WHERE id = p_task_id;

    RETURN v_total;
  END IF;

  -- Legacy single-assignee path
  IF v_task.points_awarded_at IS NOT NULL
     OR v_task.assignee_id IS NULL
     OR COALESCE(v_task.points, 0) <= 0 THEN
    RETURN 0;
  END IF;

  v_award := public.award_points_to_user(v_task, v_task.assignee_id, v_task.points);
  UPDATE public.tasks
     SET points_awarded_at = now(), points_awarded_amount = v_award
   WHERE id = p_task_id;
  RETURN v_award;
END;
$$;

-- Task trigger: settle whenever a task is (or becomes) done
CREATE OR REPLACE FUNCTION public.award_task_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF NEW.status = 'done'::public.task_status THEN
    PERFORM public.settle_task_points(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_task_points ON public.tasks;
CREATE TRIGGER trg_award_task_points
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.award_task_points();

-- Awards trigger: settle immediately when a split row is added/edited
CREATE OR REPLACE FUNCTION public.settle_awards_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM public.settle_task_points(NEW.task_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_settle_awards ON public.task_point_awards;
CREATE TRIGGER trg_settle_awards
AFTER INSERT OR UPDATE ON public.task_point_awards
FOR EACH ROW EXECUTE FUNCTION public.settle_awards_on_change();

GRANT EXECUTE ON FUNCTION public.settle_task_points(uuid) TO authenticated, service_role;