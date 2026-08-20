-- Google Drive backup sync: OAuth support + multiple destination folders.
-- Run on the self-hosted Supabase (SQL editor).

ALTER TABLE public.drive_config
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'service_account',
  ADD COLUMN IF NOT EXISTS account_email text,
  ADD COLUMN IF NOT EXISTS refresh_token_enc text,
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS oauth_state_exp timestamptz;

CREATE TABLE IF NOT EXISTS public.drive_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id text NOT NULL,
  folder_name text,
  enabled boolean NOT NULL DEFAULT true,
  keep integer NOT NULL DEFAULT 12,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_synced_at timestamptz,
  UNIQUE (folder_id)
);

GRANT ALL ON public.drive_targets TO service_role;
ALTER TABLE public.drive_targets ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: reachable only through the backup edge function.

ALTER TABLE public.backup_drive_files
  ADD COLUMN IF NOT EXISTS target_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'backup_drive_files_pkey' AND conrelid = 'public.backup_drive_files'::regclass
  ) THEN
    ALTER TABLE public.backup_drive_files DROP CONSTRAINT backup_drive_files_pkey;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS backup_drive_files_file_target_idx
  ON public.backup_drive_files (file, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::uuid));
