-- Reminders log for cron-driven due-date notifications
CREATE TABLE public.finance_reminders_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  reminder_type TEXT NOT NULL,
  sent_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, reminder_type, sent_on)
);

GRANT SELECT ON public.finance_reminders_log TO authenticated;
GRANT ALL ON public.finance_reminders_log TO service_role;

ALTER TABLE public.finance_reminders_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance admins can view reminders log"
  ON public.finance_reminders_log FOR SELECT
  TO authenticated
  USING (private.is_finance_admin(auth.uid()));

CREATE INDEX idx_finance_reminders_lookup
  ON public.finance_reminders_log (entity_type, entity_id, sent_on DESC);

-- Enable pg_cron and pg_net (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;