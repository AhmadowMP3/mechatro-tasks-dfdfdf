DROP POLICY IF EXISTS "note_comments select" ON public.note_comments;
DROP POLICY IF EXISTS "note_comments insert" ON public.note_comments;

CREATE POLICY "note_comments select" ON public.note_comments
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_comments.note_id AND n.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.note_shares s WHERE s.note_id = note_comments.note_id AND s.shared_with_user_id = auth.uid())
);

CREATE POLICY "note_comments insert" ON public.note_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_comments.note_id AND n.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.note_shares s WHERE s.note_id = note_comments.note_id AND s.shared_with_user_id = auth.uid())
  )
);