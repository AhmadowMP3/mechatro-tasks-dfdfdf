-- Self-hosted sync: the private `doc-assets` storage bucket.
--
-- It was only ever created by a Lovable migration, so the self-hosted
-- instance never had it. Needed by:
--   - Business Documents → Import from Word (stores the original .docx so the
--     exact PDF can be rendered from it)          → error "Bucket not found"
--   - Images inserted in the document editor (they silently fell back to
--     inline data URLs without it)
--
-- Read: any signed-in user. Write/delete: master admin only.
-- Idempotent: safe to run more than once.
--
-- The master-admin check reads public.profiles directly instead of calling
-- private.is_master_admin(): the self-hosted instance has no `private` schema.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('doc-assets', 'doc-assets', false, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "doc assets read" ON storage.objects;
CREATE POLICY "doc assets read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'doc-assets');

DROP POLICY IF EXISTS "doc assets master write" ON storage.objects;
CREATE POLICY "doc assets master write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'doc-assets'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_master_admin)
  );

DROP POLICY IF EXISTS "doc assets master delete" ON storage.objects;
CREATE POLICY "doc assets master delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'doc-assets'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_master_admin)
  );

-- Verification: must return one row, public = false.
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'doc-assets';
