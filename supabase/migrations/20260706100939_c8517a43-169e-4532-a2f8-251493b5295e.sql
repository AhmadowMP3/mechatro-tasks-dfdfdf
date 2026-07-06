
CREATE POLICY "note_attachments read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'note-attachments' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.note_attachments na
        JOIN public.note_shares s ON s.note_id = na.note_id
        WHERE na.file_path = name AND s.shared_with_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "note_attachments insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'note-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "note_attachments update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'note-attachments' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'note-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "note_attachments delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'note-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
