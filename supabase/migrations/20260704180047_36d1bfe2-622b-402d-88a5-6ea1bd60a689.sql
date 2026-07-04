
DELETE FROM auth.users WHERE email IN ('admin.test@mechatro.test', 'member.test@mechatro.test');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
 'admin.test@mechatro.test', crypt('Test1234!Admin', gen_salt('bf')),
 now(), '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Admin Test"}'::jsonb, now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
 'member.test@mechatro.test', crypt('Test1234!Member', gen_salt('bf')),
 now(), '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Member Test"}'::jsonb, now(), now(), '', '', '', '');

ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET role = 'admin', status = 'active', active = true, full_name = 'Admin Test'
 WHERE email = 'admin.test@mechatro.test';
UPDATE public.profiles SET role = 'member', status = 'active', active = true, full_name = 'Member Test'
 WHERE email = 'member.test@mechatro.test';
ALTER TABLE public.profiles ENABLE TRIGGER USER;
