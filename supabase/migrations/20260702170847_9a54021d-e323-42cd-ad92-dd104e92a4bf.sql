
-- 1. permission_key enum
DO $$ BEGIN
  CREATE TYPE public.permission_key AS ENUM (
    'users.invite','users.suspend','users.delete','users.change_role',
    'roles.manage',
    'projects.view','projects.create','projects.edit','projects.delete','projects.archive',
    'tasks.view','tasks.create','tasks.edit_any','tasks.edit_own','tasks.delete','tasks.assign','tasks.comment',
    'team.view','league.view','notifications.view',
    'settings.view','settings.edit',
    'backups.view','backups.run','backups.restore',
    'activity.view'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. profile_status enum
DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('pending','active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. profiles extensions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_master_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status public.profile_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_master_admin_unique
  ON public.profiles ((is_master_admin)) WHERE is_master_admin = true;

-- 4. app_config
CREATE TABLE IF NOT EXISTS public.app_config (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  master_admin_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_config_singleton CHECK (id = true)
);
INSERT INTO public.app_config (id) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_config readable by authenticated" ON public.app_config;
CREATE POLICY "app_config readable by authenticated"
  ON public.app_config FOR SELECT TO authenticated USING (true);

-- 5. roles
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#1D9BF0',
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_roles_updated_at ON public.roles;
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission public.permission_key NOT NULL,
  PRIMARY KEY (role_id, permission)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 7. user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 8. Helpers
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_master_admin = true);
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission public.permission_key)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_master_admin = true)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = _user_id
        AND rp.permission = _permission
        AND p.status = 'active'
    );
$$;

-- 9. RLS policies
DROP POLICY IF EXISTS "roles readable by authenticated" ON public.roles;
CREATE POLICY "roles readable by authenticated"
  ON public.roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "roles manageable by master admin" ON public.roles;
CREATE POLICY "roles manageable by master admin"
  ON public.roles FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "role_permissions readable by authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions readable by authenticated"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "role_permissions manageable by master admin" ON public.role_permissions;
CREATE POLICY "role_permissions manageable by master admin"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "user_roles: own row readable" ON public.user_roles;
CREATE POLICY "user_roles: own row readable"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_master_admin(auth.uid()));
DROP POLICY IF EXISTS "user_roles manageable by master admin" ON public.user_roles;
CREATE POLICY "user_roles manageable by master admin"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- 10. Seed system roles
INSERT INTO public.roles (slug, name_en, name_ar, description, color, is_system, sort_order) VALUES
  ('admin','Admin','مسؤول','Full access to all features','#1D9BF0', true, 10),
  ('member','Member','عضو','View, comment, and edit own tasks','#5AC85A', true, 20)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.pk::public.permission_key
FROM public.roles r
CROSS JOIN (SELECT unnest(enum_range(NULL::public.permission_key))::text AS pk) p
WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, perm
FROM public.roles r
CROSS JOIN (VALUES
  ('projects.view'::public.permission_key),
  ('tasks.view'::public.permission_key),
  ('tasks.edit_own'::public.permission_key),
  ('tasks.comment'::public.permission_key),
  ('team.view'::public.permission_key),
  ('league.view'::public.permission_key),
  ('notifications.view'::public.permission_key),
  ('settings.view'::public.permission_key)
) AS v(perm)
WHERE r.slug = 'member'
ON CONFLICT DO NOTHING;

-- 11. Backfill: only real auth users
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id,
  CASE WHEN p.role = 'admin' THEN (SELECT id FROM public.roles WHERE slug = 'admin')
       ELSE (SELECT id FROM public.roles WHERE slug = 'member') END
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Backfill email from auth for real users
UPDATE public.profiles p SET email = u.email
FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

-- 12. Rewritten handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT;
  v_real_count INT;
  v_master_email TEXT;
  v_is_master BOOLEAN := false;
  v_status public.profile_status := 'pending';
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  SELECT master_admin_email INTO v_master_email FROM public.app_config WHERE id = true;
  SELECT count(*) INTO v_real_count
    FROM public.profiles p JOIN auth.users u ON u.id = p.id;

  IF v_real_count = 0 OR (v_master_email IS NOT NULL AND lower(v_master_email) = lower(NEW.email)) THEN
    v_is_master := true;
    v_status := 'active';
  END IF;

  INSERT INTO public.profiles (id, full_name, role, avatar_url, email, is_master_admin, status)
  VALUES (
    NEW.id, v_name,
    CASE WHEN v_is_master THEN 'admin'::app_role ELSE 'member'::app_role END,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email,
    v_is_master,
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET
    is_master_admin = EXCLUDED.is_master_admin OR public.profiles.is_master_admin,
    status = CASE WHEN EXCLUDED.is_master_admin THEN 'active'::public.profile_status ELSE public.profiles.status END,
    email = COALESCE(public.profiles.email, EXCLUDED.email);

  IF v_is_master THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT NEW.id, id FROM public.roles WHERE slug = 'admin'
    ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 13. Master admin sync helper
CREATE OR REPLACE FUNCTION public.sync_master_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_master_email TEXT;
BEGIN
  SELECT master_admin_email INTO v_master_email FROM public.app_config WHERE id = true;
  IF v_master_email IS NULL THEN RETURN; END IF;

  UPDATE public.profiles
     SET is_master_admin = true, status = 'active'
   WHERE lower(email) = lower(v_master_email);

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT p.id, r.id
  FROM public.profiles p, public.roles r
  WHERE p.is_master_admin = true AND r.slug = 'admin'
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_master_admin() FROM PUBLIC, anon, authenticated;
