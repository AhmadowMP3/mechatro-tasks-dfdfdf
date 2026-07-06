
-- helper: check admin role via profiles (avoids type cast issues)
-- FOLDERS
CREATE TABLE public.note_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'default',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_folders TO authenticated;
GRANT ALL ON public.note_folders TO service_role;
ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_folders owner all" ON public.note_folders
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND (role='admin'::public.app_role OR is_master_admin=true)));

CREATE INDEX idx_note_folders_owner ON public.note_folders(owner_id);
CREATE TRIGGER note_folders_updated_at BEFORE UPDATE ON public.note_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TAGS
CREATE TABLE public.note_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'blue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_tags TO authenticated;
GRANT ALL ON public.note_tags TO service_role;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_tags owner all" ON public.note_tags
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND (role='admin'::public.app_role OR is_master_admin=true)));

-- NOTES
CREATE TABLE public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  folder_id UUID REFERENCES public.note_folders(id) ON DELETE SET NULL,
  color TEXT NOT NULL DEFAULT 'default',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notes_owner ON public.notes(owner_id);
CREATE INDEX idx_notes_folder ON public.notes(folder_id);
CREATE INDEX idx_notes_updated ON public.notes(updated_at DESC);
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SHARES
CREATE TABLE public.note_shares (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, shared_with_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_shares TO authenticated;
GRANT ALL ON public.note_shares TO service_role;
ALTER TABLE public.note_shares ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_note_shares_user ON public.note_shares(shared_with_user_id);

CREATE POLICY "note_shares view" ON public.note_shares
  FOR SELECT TO authenticated
  USING (
    shared_with_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid())
  );

CREATE POLICY "note_shares owner manage" ON public.note_shares
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid()));

-- Notes policies
CREATE POLICY "notes select" ON public.notes
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.note_shares s WHERE s.note_id = id AND s.shared_with_user_id = auth.uid())
  );

CREATE POLICY "notes insert" ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND (role='admin'::public.app_role OR is_master_admin=true))
  );

CREATE POLICY "notes update" ON public.notes
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "notes delete" ON public.notes
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- TAG LINKS
CREATE TABLE public.note_tag_links (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.note_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_tag_links TO authenticated;
GRANT ALL ON public.note_tag_links TO service_role;
ALTER TABLE public.note_tag_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_tag_links view" ON public.note_tag_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND (
      n.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.note_shares s WHERE s.note_id = n.id AND s.shared_with_user_id = auth.uid())
    ))
  );

CREATE POLICY "note_tag_links manage" ON public.note_tag_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid()));

-- ATTACHMENTS
CREATE TABLE public.note_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_attachments TO authenticated;
GRANT ALL ON public.note_attachments TO service_role;
ALTER TABLE public.note_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_note_attachments_note ON public.note_attachments(note_id);

CREATE POLICY "note_attachments view" ON public.note_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND (
      n.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.note_shares s WHERE s.note_id = n.id AND s.shared_with_user_id = auth.uid())
    ))
  );

CREATE POLICY "note_attachments manage" ON public.note_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.owner_id = auth.uid()));
