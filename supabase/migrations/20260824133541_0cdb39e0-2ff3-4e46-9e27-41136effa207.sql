CREATE OR REPLACE FUNCTION public.doc_type_prefix(_type public.business_doc_type)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _type
    WHEN 'quotation' THEN 'QT'
    WHEN 'rfq' THEN 'RFQ'
    WHEN 'offer' THEN 'OF'
    WHEN 'invoice' THEN 'INV'
    WHEN 'proforma_invoice' THEN 'PI'
    WHEN 'purchase_order' THEN 'PO'
  END $$;

REVOKE ALL ON FUNCTION public.next_doc_number(public.business_doc_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_doc_number(public.business_doc_type) TO authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;