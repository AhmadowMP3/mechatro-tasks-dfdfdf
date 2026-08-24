-- إلغاء تشفير قسم المالية: حذف أعمدة `enc` من كل الجداول المالية.
-- كلمة سر المالية تبقى في finance_vault_meta لكنها الآن قفل دخول فقط
-- (PBKDF2 salt + iterations + verifier) وليست مفتاح تشفير.
-- نفّذ هذا الملف مرة واحدة على سوبابيز الاستضافة الذاتية.

ALTER TABLE public.customers              DROP COLUMN IF EXISTS enc;
ALTER TABLE public.invoices               DROP COLUMN IF EXISTS enc;
ALTER TABLE public.invoice_items          DROP COLUMN IF EXISTS enc;
ALTER TABLE public.invoice_payments       DROP COLUMN IF EXISTS enc;
ALTER TABLE public.expenses               DROP COLUMN IF EXISTS enc;
ALTER TABLE public.expense_categories     DROP COLUMN IF EXISTS enc;
ALTER TABLE public.income_entries         DROP COLUMN IF EXISTS enc;
ALTER TABLE public.subscriptions_income   DROP COLUMN IF EXISTS enc;
ALTER TABLE public.subscriptions_expense  DROP COLUMN IF EXISTS enc;
ALTER TABLE public.payroll_periods        DROP COLUMN IF EXISTS enc;
ALTER TABLE public.payroll_entries        DROP COLUMN IF EXISTS enc;
ALTER TABLE public.member_salary_settings DROP COLUMN IF EXISTS enc;
ALTER TABLE public.fx_rates               DROP COLUMN IF EXISTS enc;
ALTER TABLE public.financial_settings     DROP COLUMN IF EXISTS enc;

ALTER TABLE public.finance_vault_meta ALTER COLUMN encrypted_at DROP NOT NULL;

-- امسح سجل القفل القديم ليطلب النظام تعيين كلمة سر جديدة للمالية:
DELETE FROM public.finance_vault_meta WHERE id = true;

NOTIFY pgrst, 'reload schema';
