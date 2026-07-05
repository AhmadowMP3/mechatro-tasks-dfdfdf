
CREATE POLICY "invoices_bucket_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoices' AND private.is_finance_admin(auth.uid()))
  WITH CHECK (bucket_id = 'invoices' AND private.is_finance_admin(auth.uid()));

CREATE POLICY "expense_receipts_bucket_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'expense-receipts' AND private.is_finance_admin(auth.uid()))
  WITH CHECK (bucket_id = 'expense-receipts' AND private.is_finance_admin(auth.uid()));
