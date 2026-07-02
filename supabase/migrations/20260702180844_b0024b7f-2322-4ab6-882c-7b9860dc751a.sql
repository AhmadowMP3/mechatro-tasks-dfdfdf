-- 1. Clean up orphaned seed profiles (rows with no auth.users match)
UPDATE public.tasks SET assignee_id = NULL
  WHERE assignee_id IN (SELECT p.id FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL);
UPDATE public.tasks SET created_by = NULL
  WHERE created_by IN (SELECT p.id FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL);
UPDATE public.projects SET created_by = NULL
  WHERE created_by IN (SELECT p.id FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL);
DELETE FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- 2. Ensure a default 'member' role exists
INSERT INTO public.roles (slug, name_en, name_ar, description, color, is_system, sort_order)
VALUES ('member', 'Member', 'عضو', 'Default role for invited users', '#3b82f6', true, 100)
ON CONFLICT (slug) DO NOTHING;

-- 3. Extend handle_new_user so every signup gets a user_roles row
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name TEXT;
  v_real_count INT;
  v_master_email TEXT;
  v_is_master BOOLEAN := false;
  v_status public.profile_status := 'pending';
  v_default_role_id UUID;
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
    SELECT id INTO v_default_role_id FROM public.roles WHERE slug = 'admin';
  ELSE
    SELECT id INTO v_default_role_id FROM public.roles WHERE slug = 'member';
  END IF;

  IF v_default_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_default_role_id)
    ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Ensure the trigger is attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Lock down SECURITY DEFINER function execute privileges
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_master_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, public.permission_key) FROM anon;