# Fix: "Could not find the table 'public.doc_blocks' in the schema cache"

## What the error means

The new document-content feature needs two database changes: a `body` column on `doc_templates` and a new `doc_blocks` table (plus a `doc-assets` storage bucket for images).

Those changes were applied to the Lovable-managed database. The app itself points at your self-hosted backend (`src/lib/backend-config.ts` → `https://supabase.mechatro-sy.com`), where `doc_blocks` does not exist yet — so the API returns "table not found in schema cache".

Nothing is broken in the code; the self-hosted database is just missing the migration.

## The fix (one SQL script, run once on the self-hosted server)

```sql
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

-- storage bucket for document images
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('doc-assets', 'doc-assets', false, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "doc assets read" ON storage.objects;
CREATE POLICY "doc assets read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'doc-assets');

DROP POLICY IF EXISTS "doc assets master write" ON storage.objects;
CREATE POLICY "doc assets master write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doc-assets' AND private.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "doc assets master delete" ON storage.objects;
CREATE POLICY "doc assets master delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doc-assets' AND private.is_master_admin(auth.uid()));

NOTIFY pgrst, 'reload schema';
```

Run it in the SQL editor of your self-hosted Supabase (Studio at your Coolify instance). The last line refreshes the API schema cache so the error disappears immediately.

## Code hardening I will do in this project

So the page never shows a raw red error again if a backend is missing the table:

1. `src/lib/docs/blocks.ts` — treat "table missing / schema cache" errors as an empty library instead of throwing, and show a friendly hint in the settings section.
2. `src/lib/docs/api.ts` — when saving a template, retry without the `body` field if the backend does not have that column yet, so header/footer edits keep working.
3. `src/components/documents/TemplateContentSection.tsx` — display an inline notice ("blocks library unavailable on this backend") instead of a toast error, and keep the default-content editor fully usable.
4. Also write the same SQL to `supabase/migrations/` so it stays part of the project history for future self-hosted syncs.

## Notes

- Image uploads fall back to inline (embedded) images automatically, so the content editor works even before the `doc-assets` bucket exists.
- No changes to the design or to any existing document behaviour.
