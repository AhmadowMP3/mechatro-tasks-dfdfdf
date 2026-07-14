ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sort_order double precision;

WITH ranked AS (
  SELECT id, (row_number() OVER (PARTITION BY status ORDER BY created_at ASC, id ASC))::double precision * 1000 AS ord
  FROM public.tasks
)
UPDATE public.tasks t SET sort_order = r.ord FROM ranked r WHERE t.id = r.id AND t.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS tasks_status_sort_order_idx ON public.tasks (status, sort_order);