
ALTER TABLE public.tasks DISABLE TRIGGER USER;
ALTER TABLE public.profiles DISABLE TRIGGER USER;

DELETE FROM auth.users WHERE id IN (
  '603a7a27-4ebb-4442-aae6-352e4f059ee6',
  'e64cfd87-c288-4cad-a222-14cd2f2bcf11',
  'cc5005f3-678e-47a9-b8a9-861231440a34',
  '0a3a7ef4-3ee0-4c5c-98b0-345f0e0e21ec'
);
DELETE FROM public.profiles WHERE id IN (
  '603a7a27-4ebb-4442-aae6-352e4f059ee6',
  'e64cfd87-c288-4cad-a222-14cd2f2bcf11',
  'cc5005f3-678e-47a9-b8a9-861231440a34',
  '0a3a7ef4-3ee0-4c5c-98b0-345f0e0e21ec'
);

DO $$
DECLARE
  v_users JSONB := '[
    {"username":"ghiath","email":"ghiath@mechatro.local","password":"Ghiath!Master2026","full_name":"محمد غياث شنن","role":"admin","is_master":true},
    {"username":"ahmad.hajkhalaf","email":"ahmad.hajkhalaf@mechatro.local","password":"Ahmad!Tech2026","full_name":"أحمد حج خلف","role":"admin","is_master":false},
    {"username":"anas","email":"anas@mechatro.local","password":"Anas!Admin2026","full_name":"محمد أنيس","role":"admin","is_master":false},
    {"username":"rawida","email":"rawida@mechatro.local","password":"Rawida!Member2026","full_name":"رويدة مكية","role":"member","is_master":false},
    {"username":"hasan","email":"hasan@mechatro.local","password":"Hasan!Member2026","full_name":"حسن عاشور","role":"member","is_master":false},
    {"username":"abdullah","email":"abdullah@mechatro.local","password":"Abdullah!Member2026","full_name":"عبدالله قوقو","role":"member","is_master":false}
  ]'::jsonb;
  v_rec JSONB;
  v_uid UUID;
BEGIN
  FOR v_rec IN SELECT * FROM jsonb_array_elements(v_users)
  LOOP
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated',
      v_rec->>'email',
      crypt(v_rec->>'password', gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('full_name', v_rec->>'full_name'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, username, email, role, is_master_admin, status, active)
    VALUES (
      v_uid,
      v_rec->>'full_name',
      (v_rec->>'username')::citext,
      v_rec->>'email',
      (v_rec->>'role')::public.app_role,
      (v_rec->>'is_master')::boolean,
      'active'::public.profile_status,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      username = EXCLUDED.username,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      is_master_admin = EXCLUDED.is_master_admin,
      status = 'active',
      active = true;
  END LOOP;
END $$;

UPDATE public.app_config SET master_admin_email = 'ghiath@mechatro.local' WHERE id = true;

ALTER TABLE public.tasks ENABLE TRIGGER USER;
ALTER TABLE public.profiles ENABLE TRIGGER USER;
