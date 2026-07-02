
-- Lock activity_log to admins for reads; allow authenticated inserts as self.
drop policy if exists "activity_log_select_authenticated" on public.activity_log;
drop policy if exists "activity_log_insert_self"          on public.activity_log;

create policy "activity_log_select_admin"
  on public.activity_log for select to authenticated
  using (public.is_master_admin(auth.uid()) or public.has_role(auth.uid(), 'admin'));

create policy "activity_log_insert_self"
  on public.activity_log for insert to authenticated
  with check (actor_id is null or actor_id = auth.uid());

grant insert on public.activity_log to authenticated;

create index if not exists idx_activity_actor  on public.activity_log(actor_id);
create index if not exists idx_activity_entity on public.activity_log(entity_type, entity_id);
