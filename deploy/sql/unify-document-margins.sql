-- Run once on the self-hosted database to unify page margins across all
-- existing document templates, documents and stored revisions:
-- 25 mm side margins, 12 mm top/bottom. Safe to run more than once.

UPDATE public.doc_templates
SET header = jsonb_set(jsonb_set(jsonb_set(coalesce(header, '{}'::jsonb),
      '{marginTop}', '12'::jsonb, true),
      '{marginBottom}', '12'::jsonb, true),
      '{marginSide}', '25'::jsonb, true);

UPDATE public.business_docs
SET header_override = jsonb_set(jsonb_set(jsonb_set(header_override,
      '{marginTop}', '12'::jsonb, true),
      '{marginBottom}', '12'::jsonb, true),
      '{marginSide}', '25'::jsonb, true)
WHERE header_override IS NOT NULL;

UPDATE public.business_doc_revisions
SET header_override = jsonb_set(jsonb_set(jsonb_set(header_override,
      '{marginTop}', '12'::jsonb, true),
      '{marginBottom}', '12'::jsonb, true),
      '{marginSide}', '25'::jsonb, true)
WHERE header_override IS NOT NULL;
