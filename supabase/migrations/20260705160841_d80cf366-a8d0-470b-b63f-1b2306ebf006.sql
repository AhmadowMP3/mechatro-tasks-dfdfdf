CREATE POLICY "member_reports_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));

CREATE POLICY "member_reports_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));

CREATE POLICY "member_reports_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'member-reports' AND private.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));

CREATE POLICY "member_reports_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-reports' AND private.is_admin(auth.uid()));