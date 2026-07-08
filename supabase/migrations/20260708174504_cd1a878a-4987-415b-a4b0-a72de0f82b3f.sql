
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  uuid,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees(user_id);

GRANT SELECT, INSERT, DELETE ON public.task_assignees TO authenticated;
GRANT ALL ON public.task_assignees TO service_role;

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_assignees_admin_all ON public.task_assignees;
CREATE POLICY task_assignees_admin_all ON public.task_assignees
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS task_assignees_self_read ON public.task_assignees;
CREATE POLICY task_assignees_self_read ON public.task_assignees
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS task_assignees_member_insert ON public.task_assignees;
CREATE POLICY task_assignees_member_insert ON public.task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS task_assignees_member_delete ON public.task_assignees;
CREATE POLICY task_assignees_member_delete ON public.task_assignees
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.sync_task_primary_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid := COALESCE(NEW.task_id, OLD.task_id);
  v_current uuid;
  v_earliest uuid;
BEGIN
  SELECT assignee_id INTO v_current FROM public.tasks WHERE id = v_task_id;
  SELECT user_id INTO v_earliest
    FROM public.task_assignees
    WHERE task_id = v_task_id
    ORDER BY assigned_at ASC, user_id ASC
    LIMIT 1;

  IF v_current IS NULL
     OR v_earliest IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.task_assignees
       WHERE task_id = v_task_id AND user_id = v_current
     )
  THEN
    UPDATE public.tasks SET assignee_id = v_earliest WHERE id = v_task_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignees_sync ON public.task_assignees;
CREATE TRIGGER trg_task_assignees_sync
AFTER INSERT OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.sync_task_primary_assignee();

-- Backfill, skipping orphaned assignee references
INSERT INTO public.task_assignees (task_id, user_id, assigned_at, assigned_by)
SELECT t.id, t.assignee_id, COALESCE(t.created_at, now()), t.created_by
  FROM public.tasks t
  JOIN auth.users u ON u.id = t.assignee_id
 WHERE t.assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;
