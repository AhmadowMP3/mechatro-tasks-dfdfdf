
-- 1) Table
CREATE TABLE public.member_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'member' CHECK (kind IN ('member','comparison')),
  member_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_name_snapshot TEXT,
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_by_name_snapshot TEXT,
  language TEXT NOT NULL CHECK (language IN ('ar','en','bilingual')),
  range_key TEXT NOT NULL,
  range_from TIMESTAMPTZ,
  range_to TIMESTAMPTZ,
  pdf_path TEXT NOT NULL,
  pdf_size_bytes BIGINT,
  page_count INT,
  compare_member_a UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  compare_member_b UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  compare_report_a UUID REFERENCES public.member_reports(id) ON DELETE SET NULL,
  compare_report_b UUID REFERENCES public.member_reports(id) ON DELETE SET NULL,
  kpi_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX member_reports_member_idx ON public.member_reports(member_id, created_at DESC);
CREATE INDEX member_reports_kind_idx ON public.member_reports(kind, created_at DESC);
CREATE INDEX member_reports_generated_by_idx ON public.member_reports(generated_by, created_at DESC);

-- 2) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_reports TO authenticated;
GRANT ALL ON public.member_reports TO service_role;

-- 3) RLS
ALTER TABLE public.member_reports ENABLE ROW LEVEL SECURITY;

-- 4) Policies: admin/manager only
CREATE POLICY "member_reports admin/manager select"
  ON public.member_reports FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "member_reports admin/manager insert"
  ON public.member_reports FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "member_reports admin/manager update"
  ON public.member_reports FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "member_reports admin/manager delete"
  ON public.member_reports FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- 5) updated_at trigger
CREATE TRIGGER member_reports_set_updated_at
  BEFORE UPDATE ON public.member_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Storage policies for member-reports bucket
CREATE POLICY "member-reports admin/manager select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-reports' AND public.is_admin_or_manager(auth.uid()));

CREATE POLICY "member-reports admin/manager insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-reports' AND public.is_admin_or_manager(auth.uid()));

CREATE POLICY "member-reports admin/manager update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'member-reports' AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (bucket_id = 'member-reports' AND public.is_admin_or_manager(auth.uid()));

CREATE POLICY "member-reports admin/manager delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-reports' AND public.is_admin_or_manager(auth.uid()));
