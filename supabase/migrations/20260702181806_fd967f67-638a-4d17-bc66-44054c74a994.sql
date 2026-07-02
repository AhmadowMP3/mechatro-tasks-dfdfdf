
-- ============================================================
-- 1. Migrate existing 'manager' role -> 'admin' before we drop
-- ============================================================
UPDATE public.profiles SET role = 'admin' WHERE role = 'manager';

-- ============================================================
-- 2. Drop dynamic role tables and permission_key enum
-- ============================================================
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(uuid, permission_key) CASCADE;
DROP TYPE IF EXISTS public.permission_key CASCADE;

-- Drop legacy helpers that reference dropped tables/manager
DROP FUNCTION IF EXISTS public.is_admin_or_manager(uuid) CASCADE;

-- ============================================================
-- 3. Canonical helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_master_admin = true);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (is_master_admin = true OR role = 'admin')
      AND (status = 'active' OR is_master_admin = true)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role AND active = true
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- ============================================================
-- 4. handle_new_user: no more role tables; default status = pending
-- ============================================================
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

  RETURN NEW;
END;
$$;

-- Recreate sync_master_admin without user_roles
CREATE OR REPLACE FUNCTION public.sync_master_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_master_email TEXT;
BEGIN
  SELECT master_admin_email INTO v_master_email FROM public.app_config WHERE id = true;
  IF v_master_email IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
     SET is_master_admin = true, status = 'active', role = 'admin'
   WHERE lower(email) = lower(v_master_email);
END;
$$;

-- ============================================================
-- 5. Team directory view (name + avatar only, no PII)
-- ============================================================
DROP VIEW IF EXISTS public.team_directory;
CREATE VIEW public.team_directory
WITH (security_invoker = on) AS
  SELECT id, full_name, avatar_url
  FROM public.profiles
  WHERE status = 'active' AND active = true;

GRANT SELECT ON public.team_directory TO authenticated;

-- ============================================================
-- 6. RLS — profiles
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles_admin_read_all" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_manage" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- 7. RLS — projects
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='projects' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.projects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "projects_admin_all" ON public.projects
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "projects_member_read_scoped" ON public.projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.project_id = projects.id AND t.assignee_id = auth.uid()
    )
  );

-- ============================================================
-- 8. RLS — tasks
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='tasks' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "tasks_admin_all" ON public.tasks
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tasks_assignee_read" ON public.tasks
  FOR SELECT TO authenticated
  USING (assignee_id = auth.uid());

CREATE POLICY "tasks_assignee_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- Trigger to prevent members from mutating protected fields
CREATE OR REPLACE FUNCTION public.tasks_guard_member_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  -- Non-admin (member updating own task): allow only status/progress/completed_at changes
  IF NEW.title            IS DISTINCT FROM OLD.title
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.assignee_id    IS DISTINCT FROM OLD.assignee_id
    OR NEW.project_id     IS DISTINCT FROM OLD.project_id
    OR NEW.priority       IS DISTINCT FROM OLD.priority
    OR NEW.due_date       IS DISTINCT FROM OLD.due_date
    OR NEW.start_date     IS DISTINCT FROM OLD.start_date
    OR NEW.created_by     IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Members can only update task status, progress, and completion';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_guard_member_updates ON public.tasks;
CREATE TRIGGER tasks_guard_member_updates
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_guard_member_updates();

-- ============================================================
-- 9. RLS — task_comments
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='task_comments' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.task_comments', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "task_comments_admin_all" ON public.task_comments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "task_comments_assignee_read" ON public.task_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_comments.task_id AND t.assignee_id = auth.uid()));

CREATE POLICY "task_comments_assignee_insert" ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_comments.task_id AND t.assignee_id = auth.uid())
  );

-- ============================================================
-- 10. RLS — task_files
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='task_files' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.task_files', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "task_files_admin_all" ON public.task_files
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "task_files_assignee_read" ON public.task_files
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_files.task_id AND t.assignee_id = auth.uid()));

CREATE POLICY "task_files_assignee_insert" ON public.task_files
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_files.task_id AND t.assignee_id = auth.uid())
  );

CREATE POLICY "task_files_assignee_delete" ON public.task_files
  FOR DELETE TO authenticated
  USING (added_by = auth.uid());

-- ============================================================
-- 11. RLS — work_sessions
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='work_sessions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.work_sessions', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "work_sessions_admin_all" ON public.work_sessions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "work_sessions_own_all" ON public.work_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 12. RLS — notifications (each user sees own)
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='notifications' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "notifications_own_read" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications_own_update" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_admin_manage" ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- 13. RLS — activity_log (admin-only read; anyone can log own activity)
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='activity_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_log', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "activity_log_admin_read" ON public.activity_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "activity_log_self_insert" ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- ============================================================
-- 14. RLS — member_reports (admin only)
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='member_reports' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.member_reports', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "member_reports_admin_all" ON public.member_reports
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- 15. RLS — references (all read; admin write)
-- ============================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='references' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.references', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "references_read_all" ON public.references
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "references_admin_write" ON public.references
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
