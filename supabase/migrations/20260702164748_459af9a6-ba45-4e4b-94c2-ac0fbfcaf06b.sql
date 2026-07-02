
-- =========================================================================
-- Helper: role check via security-definer function (avoids RLS recursion)
-- =========================================================================
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and role = _role and active = true
  )
$$;

create or replace function public.is_admin_or_manager(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and role in ('admin','manager') and active = true
  )
$$;

-- =========================================================================
-- Drop existing overly-permissive policies
-- =========================================================================
drop policy if exists open_profiles       on public.profiles;
drop policy if exists open_projects       on public.projects;
drop policy if exists open_tasks          on public.tasks;
drop policy if exists open_task_files     on public.task_files;
drop policy if exists open_comments       on public.task_comments;
drop policy if exists open_work_sessions  on public.work_sessions;
drop policy if exists open_activity       on public.activity_log;
drop policy if exists open_notifications  on public.notifications;

-- Revoke previously-granted anon access; keep authenticated/service_role.
revoke all on public.profiles       from anon;
revoke all on public.projects       from anon;
revoke all on public.tasks          from anon;
revoke all on public.task_files     from anon;
revoke all on public.task_comments  from anon;
revoke all on public.work_sessions  from anon;
revoke all on public.activity_log   from anon;
revoke all on public.notifications  from anon;

grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.projects      to authenticated;
grant select, insert, update, delete on public.tasks         to authenticated;
grant select, insert, update, delete on public.task_files    to authenticated;
grant select, insert, update, delete on public.task_comments to authenticated;
grant select, insert, update, delete on public.work_sessions to authenticated;
grant select                          on public.activity_log  to authenticated;
grant select, update                   on public.notifications to authenticated;

grant all on public.profiles       to service_role;
grant all on public.projects       to service_role;
grant all on public.tasks          to service_role;
grant all on public.task_files     to service_role;
grant all on public.task_comments  to service_role;
grant all on public.work_sessions  to service_role;
grant all on public.activity_log   to service_role;
grant all on public.notifications  to service_role;

-- =========================================================================
-- profiles
-- =========================================================================
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (auth.uid() is not null);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_admin_manage"
  on public.profiles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- projects
-- =========================================================================
create policy "projects_select_authenticated"
  on public.projects for select to authenticated
  using (auth.uid() is not null);

create policy "projects_manage_by_managers"
  on public.projects for all to authenticated
  using (public.is_admin_or_manager(auth.uid()))
  with check (public.is_admin_or_manager(auth.uid()));

-- =========================================================================
-- tasks
-- =========================================================================
create policy "tasks_select_authenticated"
  on public.tasks for select to authenticated
  using (auth.uid() is not null);

create policy "tasks_manage_by_managers"
  on public.tasks for all to authenticated
  using (public.is_admin_or_manager(auth.uid()))
  with check (public.is_admin_or_manager(auth.uid()));

create policy "tasks_update_by_assignee"
  on public.tasks for update to authenticated
  using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());

-- =========================================================================
-- task_comments
-- =========================================================================
create policy "task_comments_select_authenticated"
  on public.task_comments for select to authenticated
  using (auth.uid() is not null);

create policy "task_comments_insert_self"
  on public.task_comments for insert to authenticated
  with check (author_id = auth.uid());

create policy "task_comments_update_own"
  on public.task_comments for update to authenticated
  using (author_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (author_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "task_comments_delete_own"
  on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- task_files
-- =========================================================================
create policy "task_files_select_authenticated"
  on public.task_files for select to authenticated
  using (auth.uid() is not null);

create policy "task_files_insert_self"
  on public.task_files for insert to authenticated
  with check (added_by = auth.uid());

create policy "task_files_delete_own"
  on public.task_files for delete to authenticated
  using (added_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "task_files_update_own"
  on public.task_files for update to authenticated
  using (added_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (added_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- work_sessions
-- =========================================================================
create policy "work_sessions_select_own_or_admin"
  on public.work_sessions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "work_sessions_insert_self"
  on public.work_sessions for insert to authenticated
  with check (user_id = auth.uid());

create policy "work_sessions_update_own"
  on public.work_sessions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "work_sessions_delete_own_or_admin"
  on public.work_sessions for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- activity_log — read-only for signed-in users; writes only via service_role
-- =========================================================================
create policy "activity_log_select_authenticated"
  on public.activity_log for select to authenticated
  using (auth.uid() is not null);

-- (no insert/update/delete policies for authenticated: service_role bypasses RLS)

-- =========================================================================
-- notifications — users see/modify only their own; writes only via service_role
-- =========================================================================
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- storage.objects policies for the private 'backups' bucket
-- =========================================================================
drop policy if exists "backups_read_authenticated"   on storage.objects;
drop policy if exists "backups_write_service_role"   on storage.objects;
drop policy if exists "backups_update_service_role"  on storage.objects;
drop policy if exists "backups_delete_service_role"  on storage.objects;

create policy "backups_read_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'backups');

create policy "backups_write_service_role"
  on storage.objects for insert to service_role
  with check (bucket_id = 'backups');

create policy "backups_update_service_role"
  on storage.objects for update to service_role
  using (bucket_id = 'backups')
  with check (bucket_id = 'backups');

create policy "backups_delete_service_role"
  on storage.objects for delete to service_role
  using (bucket_id = 'backups');
