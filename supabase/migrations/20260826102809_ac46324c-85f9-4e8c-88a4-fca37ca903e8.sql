ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.tasks_auto_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'done' THEN
    IF NEW.archived IS NOT TRUE THEN
      NEW.archived := true;
      NEW.archived_at := COALESCE(NEW.archived_at, now());
    END IF;
  ELSE
    NEW.archived := false;
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_auto_archive ON public.tasks;
CREATE TRIGGER trg_tasks_auto_archive
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_auto_archive();

UPDATE public.tasks
   SET archived = true,
       archived_at = COALESCE(archived_at, completed_at, updated_at, now())
 WHERE status = 'done' AND archived IS NOT TRUE;

UPDATE public.tasks
   SET archived = false, archived_at = NULL
 WHERE status <> 'done' AND (archived IS TRUE OR archived_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS tasks_archived_status_idx ON public.tasks (archived, status);