
-- 1) Private schema for role-check helpers so they are no longer callable by signed-in users via the Data API.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION private.is_master_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_master_admin = true);
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (is_master_admin = true OR role = 'admin')
      AND (status = 'active' OR is_master_admin = true)
  );
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_master_admin(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Recreate policies to reference private.* helpers.
DROP POLICY IF EXISTS "Admins can view invites" ON public.invites;
DROP POLICY IF EXISTS "Admins can insert invites" ON public.invites;
DROP POLICY IF EXISTS "Admins can update invites" ON public.invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.invites;
CREATE POLICY "Admins can view invites"   ON public.invites FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "Admins can insert invites" ON public.invites FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "Admins can update invites" ON public.invites FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "Admins can delete invites" ON public.invites FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "master admin manages share links" ON public.share_links;
CREATE POLICY "master admin manages share links" ON public.share_links FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS profiles_admin_read_all ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_manage   ON public.profiles;
CREATE POLICY profiles_admin_read_all ON public.profiles FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY profiles_admin_manage   ON public.profiles FOR ALL    TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS projects_admin_all      ON public.projects;
CREATE POLICY projects_admin_all      ON public.projects FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS task_files_admin_all    ON public.task_files;
CREATE POLICY task_files_admin_all    ON public.task_files FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS tasks_admin_all         ON public.tasks;
CREATE POLICY tasks_admin_all         ON public.tasks FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS task_comments_admin_all ON public.task_comments;
CREATE POLICY task_comments_admin_all ON public.task_comments FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS work_sessions_admin_all ON public.work_sessions;
CREATE POLICY work_sessions_admin_all ON public.work_sessions FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS notifications_admin_manage ON public.notifications;
CREATE POLICY notifications_admin_manage ON public.notifications FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS activity_log_admin_read ON public.activity_log;
CREATE POLICY activity_log_admin_read ON public.activity_log FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS member_reports_admin_all ON public.member_reports;
CREATE POLICY member_reports_admin_all ON public.member_reports FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS references_admin_write ON public.references;
CREATE POLICY references_admin_write ON public.references FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

-- 3) Rewire internal trigger/DB functions to call private.* (they run as SECURITY DEFINER so they have access).
CREATE OR REPLACE FUNCTION public.tasks_guard_member_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF private.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.title          IS DISTINCT FROM OLD.title
    OR NEW.description  IS DISTINCT FROM OLD.description
    OR NEW.assignee_id  IS DISTINCT FROM OLD.assignee_id
    OR NEW.project_id   IS DISTINCT FROM OLD.project_id
    OR NEW.priority     IS DISTINCT FROM OLD.priority
    OR NEW.due_date     IS DISTINCT FROM OLD.due_date
    OR NEW.start_date   IS DISTINCT FROM OLD.start_date
    OR NEW.created_by   IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Members can only update task status, progress, and completion';
  END IF;
  IF NEW.status = 'done'::public.task_status AND OLD.status IS DISTINCT FROM 'done'::public.task_status THEN
    RAISE EXCEPTION 'Only admins can mark a task as done. Please submit it for review instead.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_assignee_on_admin_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_row public.tasks%ROWTYPE;
  actor_name text;
BEGIN
  SELECT * INTO t_row FROM public.tasks WHERE id = NEW.task_id;
  IF t_row.assignee_id IS NULL OR t_row.assignee_id = NEW.author_id THEN
    RETURN NEW;
  END IF;
  IF NOT private.is_admin(NEW.author_id) THEN
    RETURN NEW;
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.author_id;
  INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
  VALUES (
    t_row.assignee_id, 'admin_comment',
    'تعليق جديد من المدير', 'New comment from admin',
    COALESCE(actor_name, 'Admin') || ' → ' || t_row.title, t_row.id
  );
  RETURN NEW;
END;
$$;

-- 4) Drop the public role-check helpers now that policies use private.*.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.is_master_admin(uuid);

-- 5) Prevent members from self-escalating role/status/admin flags via profile self-update.
CREATE OR REPLACE FUNCTION public.profiles_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Admins bypass the guard (managed by profiles_admin_manage).
  IF private.is_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_master_admin IS DISTINCT FROM OLD.is_master_admin
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.email  IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'Members cannot change identity, role, admin flag, active flag, or status';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_guard_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_self_update ON public.profiles;
CREATE TRIGGER profiles_guard_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_self_update();

-- 6) Restrict backups bucket reads to the master admin only.
DROP POLICY IF EXISTS backups_read_authenticated ON storage.objects;
CREATE POLICY backups_read_master_admin ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND private.is_master_admin(auth.uid()));
