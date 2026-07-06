
CREATE OR REPLACE FUNCTION public.can_view_note(_note_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notes n WHERE n.id = _note_id AND n.owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.note_shares s WHERE s.note_id = _note_id AND s.shared_with_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_note_owner(_note_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.notes n WHERE n.id = _note_id AND n.owner_id = _user_id);
$$;

-- Rewrite notes SELECT policy without cross-referencing note_shares in a way that recurses
DROP POLICY IF EXISTS "notes select" ON public.notes;
CREATE POLICY "notes select" ON public.notes
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.note_shares s
      WHERE s.note_id = notes.id AND s.shared_with_user_id = auth.uid()
    )
  );

-- Rewrite note_shares view policy to use security-definer helper (breaks recursion)
DROP POLICY IF EXISTS "note_shares view" ON public.note_shares;
CREATE POLICY "note_shares view" ON public.note_shares
  FOR SELECT TO authenticated
  USING (
    shared_with_user_id = auth.uid()
    OR public.is_note_owner(note_id, auth.uid())
  );

DROP POLICY IF EXISTS "note_shares owner manage" ON public.note_shares;
CREATE POLICY "note_shares owner manage" ON public.note_shares
  FOR ALL TO authenticated
  USING (public.is_note_owner(note_id, auth.uid()))
  WITH CHECK (public.is_note_owner(note_id, auth.uid()));

DROP POLICY IF EXISTS "note_tag_links view" ON public.note_tag_links;
CREATE POLICY "note_tag_links view" ON public.note_tag_links
  FOR SELECT TO authenticated
  USING (public.can_view_note(note_id, auth.uid()));

DROP POLICY IF EXISTS "note_tag_links manage" ON public.note_tag_links;
CREATE POLICY "note_tag_links manage" ON public.note_tag_links
  FOR ALL TO authenticated
  USING (public.is_note_owner(note_id, auth.uid()))
  WITH CHECK (public.is_note_owner(note_id, auth.uid()));

DROP POLICY IF EXISTS "note_attachments view" ON public.note_attachments;
CREATE POLICY "note_attachments view" ON public.note_attachments
  FOR SELECT TO authenticated
  USING (public.can_view_note(note_id, auth.uid()));

DROP POLICY IF EXISTS "note_attachments manage" ON public.note_attachments;
CREATE POLICY "note_attachments manage" ON public.note_attachments
  FOR ALL TO authenticated
  USING (public.is_note_owner(note_id, auth.uid()))
  WITH CHECK (public.is_note_owner(note_id, auth.uid()));
