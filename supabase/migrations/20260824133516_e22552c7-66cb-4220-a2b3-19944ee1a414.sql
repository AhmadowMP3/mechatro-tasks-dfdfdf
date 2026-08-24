-- ── Enums ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.business_doc_type AS ENUM ('quotation','rfq','offer','invoice','proforma_invoice','purchase_order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.business_doc_status AS ENUM ('draft','sent','accepted','rejected','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Templates (editable header / footer / defaults per doc type) ───────
CREATE TABLE IF NOT EXISTS public.doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type public.business_doc_type NOT NULL,
  name text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT true,
  header jsonb NOT NULL DEFAULT '{}'::jsonb,
  footer jsonb NOT NULL DEFAULT '{}'::jsonb,
  defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS doc_templates_default_per_type
  ON public.doc_templates (doc_type) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_templates TO authenticated;
GRANT ALL ON public.doc_templates TO service_role;
ALTER TABLE public.doc_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_templates_master ON public.doc_templates;
CREATE POLICY doc_templates_master ON public.doc_templates FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

-- ── Documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type public.business_doc_type NOT NULL,
  number text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  title text NOT NULL DEFAULT '',
  client jsonb NOT NULL DEFAULT '{}'::jsonb,
  lang text NOT NULL DEFAULT 'en',
  theme text NOT NULL DEFAULT 'light',
  currency text NOT NULL DEFAULT 'USD',
  model jsonb NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  header_override jsonb,
  footer_override jsonb,
  status public.business_doc_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT current_date,
  valid_until date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_docs_lang_chk CHECK (lang IN ('ar','en')),
  CONSTRAINT business_docs_theme_chk CHECK (theme IN ('light','dark'))
);
CREATE INDEX IF NOT EXISTS business_docs_type_created_idx ON public.business_docs (doc_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS business_docs_number_rev_key ON public.business_docs (number, revision);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_docs TO authenticated;
GRANT ALL ON public.business_docs TO service_role;
ALTER TABLE public.business_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_docs_master ON public.business_docs;
CREATE POLICY business_docs_master ON public.business_docs FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

-- ── Revision snapshots ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_doc_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.business_docs(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  number text NOT NULL,
  model jsonb NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  header_override jsonb,
  footer_override jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_doc_revisions_doc_idx ON public.business_doc_revisions (doc_id, revision DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_doc_revisions TO authenticated;
GRANT ALL ON public.business_doc_revisions TO service_role;
ALTER TABLE public.business_doc_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_doc_revisions_master ON public.business_doc_revisions;
CREATE POLICY business_doc_revisions_master ON public.business_doc_revisions FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

-- ── Per-type / per-year counters ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_counters (
  doc_type public.business_doc_type NOT NULL,
  year integer NOT NULL,
  seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, year)
);
GRANT SELECT ON public.doc_counters TO authenticated;
GRANT ALL ON public.doc_counters TO service_role;
ALTER TABLE public.doc_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_counters_master ON public.doc_counters;
CREATE POLICY doc_counters_master ON public.doc_counters FOR SELECT TO authenticated
  USING (private.is_master_admin(auth.uid()));

-- ── updated_at triggers ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS doc_templates_touch ON public.doc_templates;
CREATE TRIGGER doc_templates_touch BEFORE UPDATE ON public.doc_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS business_docs_touch ON public.business_docs;
CREATE TRIGGER business_docs_touch BEFORE UPDATE ON public.business_docs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Number generator: Mktro-QT-011-24-08-26-R01 ───────────────────────
CREATE OR REPLACE FUNCTION public.doc_type_prefix(_type public.business_doc_type)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _type
    WHEN 'quotation' THEN 'QT'
    WHEN 'rfq' THEN 'RFQ'
    WHEN 'offer' THEN 'OF'
    WHEN 'invoice' THEN 'INV'
    WHEN 'proforma_invoice' THEN 'PI'
    WHEN 'purchase_order' THEN 'PO'
  END $$;

CREATE OR REPLACE FUNCTION public.next_doc_number(_type public.business_doc_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer := EXTRACT(YEAR FROM current_date)::int;
  n integer;
BEGIN
  IF NOT private.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.doc_counters (doc_type, year, seq)
  VALUES (_type, y, 1)
  ON CONFLICT (doc_type, year) DO UPDATE SET seq = public.doc_counters.seq + 1
  RETURNING seq INTO n;

  RETURN 'Mktro-' || public.doc_type_prefix(_type) || '-' || lpad(n::text, 3, '0')
    || '-' || to_char(current_date, 'DD-MM-YY') || '-R01';
END $$;

GRANT EXECUTE ON FUNCTION public.next_doc_number(public.business_doc_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doc_type_prefix(public.business_doc_type) TO authenticated;