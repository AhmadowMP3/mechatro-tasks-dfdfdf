-- Multi-device / device-limit enforcement for invites and profiles.

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS max_devices integer NOT NULL DEFAULT 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_devices integer NOT NULL DEFAULT 1;

-- user_sessions: one row per (user_id, device_id). Service role writes;
-- authenticated users can read only their own rows (needed for realtime kick signal).
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  UNIQUE (user_id, device_id)
);

GRANT SELECT ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sessions" ON public.user_sessions;
CREATE POLICY "Users read own sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON public.user_sessions(user_id, last_seen_at DESC);

-- Enable realtime so kicked devices get notified instantly.
ALTER TABLE public.user_sessions REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
