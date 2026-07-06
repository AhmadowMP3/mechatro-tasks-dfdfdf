ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS emoji TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notes_favorite ON public.notes(owner_id, is_favorite) WHERE is_favorite = true;

ALTER TABLE public.note_shares
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('view','edit'));

CREATE TABLE IF NOT EXISTS public.note_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_comments TO authenticated;
GRANT ALL ON public.note_comments TO service_role;
ALTER TABLE public.note_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_note_comments_note ON public.note_comments(note_id, created_at);

CREATE POLICY "note_comments select" ON public.note_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.note_shares s WHERE s.note_id = note_id AND s.shared_with_user_id = auth.uid())
  );

CREATE POLICY "note_comments insert" ON public.note_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.note_shares s WHERE s.note_id = note_id AND s.shared_with_user_id = auth.uid())
    )
  );

CREATE POLICY "note_comments update" ON public.note_comments
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid())
  )
  WITH CHECK (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid())
  );

CREATE POLICY "note_comments delete" ON public.note_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid())
  );