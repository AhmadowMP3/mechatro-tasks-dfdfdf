-- Fix: "Could not find the table 'public.drive_config' in the schema cache"
-- Run once on the SELF-HOSTED Supabase (SQL editor / psql). Safe to re-run.

-- 1) drive_config (single-row config for the Google Drive backup sync)
CREATE TABLE IF NOT EXISTS public.drive_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  client_email TEXT,
  folder_id TEXT,
  folder_name TEXT,
  sa_json_enc TEXT,
  connected_at TIMESTAMPTZ,
  connected_by UUID,
  last_error TEXT
);

ALTER TABLE public.drive_config
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'service_account',
  ADD COLUMN IF NOT EXISTS account_email text,
  ADD COLUMN IF NOT EXISTS refresh_token_enc text,
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS oauth_state_exp timestamptz;

REVOKE ALL ON public.drive_config FROM anon, authenticated;
GRANT ALL ON public.drive_config TO service_role;
ALTER TABLE public.drive_config ENABLE ROW LEVEL SECURITY;

-- 2) drive_targets (multiple destination folders)
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

-- 3) backup_drive_files (sync log per backup file)
CREATE TABLE IF NOT EXISTS public.backup_drive_files (
  file text PRIMARY KEY,
  drive_file_id text,
  drive_name text,
  drive_link text,
  size_bytes bigint,
  synced_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_drive_files
  ADD COLUMN IF NOT EXISTS target_id uuid;

GRANT SELECT ON public.backup_drive_files TO authenticated;
GRANT ALL ON public.backup_drive_files TO service_role;
ALTER TABLE public.backup_drive_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'backup_drive_files_pkey'
       AND conrelid = 'public.backup_drive_files'::regclass
  ) THEN
    ALTER TABLE public.backup_drive_files DROP CONSTRAINT backup_drive_files_pkey;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS backup_drive_files_file_target_idx
  ON public.backup_drive_files (file, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::uuid));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'backup_drive_files'
       AND policyname = 'backup_drive_files_master_read'
  ) THEN
    CREATE POLICY "backup_drive_files_master_read"
      ON public.backup_drive_files
      FOR SELECT TO authenticated
      USING (private.is_master_admin(auth.uid()));
  END IF;
END $$;

-- 4) Refresh the PostgREST schema cache so the API sees the new tables.
NOTIFY pgrst, 'reload schema';
