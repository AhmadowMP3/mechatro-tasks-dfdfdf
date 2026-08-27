ALTER TABLE public.doc_templates ADD COLUMN IF NOT EXISTS body jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.doc_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_blocks TO authenticated;
GRANT ALL ON public.doc_blocks TO service_role;
ALTER TABLE public.doc_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_blocks_read ON public.doc_blocks;
CREATE POLICY doc_blocks_read ON public.doc_blocks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS doc_blocks_master_write ON public.doc_blocks;
CREATE POLICY doc_blocks_master_write ON public.doc_blocks FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

DROP TRIGGER IF EXISTS doc_blocks_touch ON public.doc_blocks;
CREATE TRIGGER doc_blocks_touch BEFORE UPDATE ON public.doc_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP POLICY IF EXISTS "doc assets read" ON storage.objects;
CREATE POLICY "doc assets read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'doc-assets');

DROP POLICY IF EXISTS "doc assets master write" ON storage.objects;
CREATE POLICY "doc assets master write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doc-assets' AND private.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "doc assets master delete" ON storage.objects;
CREATE POLICY "doc assets master delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doc-assets' AND private.is_master_admin(auth.uid()));