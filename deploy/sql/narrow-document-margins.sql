-- Word "Narrow" margins (0.5 in = 12.7 mm) for every template and document.
-- Idempotent: safe to run more than once. Run on the self-hosted database too.

UPDATE public.doc_templates
SET header = jsonb_set(jsonb_set(jsonb_set(COALESCE(header, '{}'::jsonb),
      '{marginTop}', '12.7'::jsonb, true),
      '{marginBottom}', '12.7'::jsonb, true),
      '{marginSide}', '12.7'::jsonb, true);

UPDATE public.business_docs
SET header_override = jsonb_set(jsonb_set(jsonb_set(header_override,
      '{marginTop}', '12.7'::jsonb, true),
      '{marginBottom}', '12.7'::jsonb, true),
      '{marginSide}', '12.7'::jsonb, true)
WHERE header_override IS NOT NULL;

UPDATE public.business_doc_revisions
SET header_override = jsonb_set(jsonb_set(jsonb_set(header_override,
      '{marginTop}', '12.7'::jsonb, true),
      '{marginBottom}', '12.7'::jsonb, true),
      '{marginSide}', '12.7'::jsonb, true)
WHERE header_override IS NOT NULL;
