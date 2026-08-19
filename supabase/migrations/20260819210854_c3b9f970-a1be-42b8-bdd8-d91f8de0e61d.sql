CREATE TABLE public.backup_drive_files (
  file text PRIMARY KEY,
  drive_file_id text,
  drive_name text,
  drive_link text,
  size_bytes bigint,
  synced_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backup_drive_files TO authenticated;
GRANT ALL ON public.backup_drive_files TO service_role;

ALTER TABLE public.backup_drive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_drive_files_master_read"
ON public.backup_drive_files
FOR SELECT
TO authenticated
USING (private.is_master_admin(auth.uid()));