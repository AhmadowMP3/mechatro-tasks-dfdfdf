ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET is_master_admin = false WHERE is_master_admin = true AND id <> 'd90cf90e-9301-4ffd-aad3-8b2000ee34e3';
UPDATE public.profiles SET is_master_admin = true, role = 'admin', status = 'active' WHERE id = 'd90cf90e-9301-4ffd-aad3-8b2000ee34e3';
ALTER TABLE public.profiles ENABLE TRIGGER USER;
UPDATE public.app_config SET master_admin_email = 'admin.test@mechatro.test' WHERE id = true;
INSERT INTO public.app_config (id, master_admin_email) SELECT true, 'admin.test@mechatro.test' WHERE NOT EXISTS (SELECT 1 FROM public.app_config WHERE id = true);