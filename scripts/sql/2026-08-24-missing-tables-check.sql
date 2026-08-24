-- ============================================================================
-- فحص الجداول الناقصة على سوبابيز الذاتي + إنشاء backup_error_log
-- آمن لإعادة التشغيل: لا يحذف ولا يعدّل أي بيانات موجودة.
-- شغّله كاملاً في SQL Editor.
-- ============================================================================

-- 1) تحقّق قبل التنفيذ: يطبع الجداول المطلوبة وغير الموجودة عندك
with required(name) as (
  values ('activity_log'),('app_config'),('backup_drive_files'),('backup_error_log'),
         ('backup_requests'),('business_doc_revisions'),('business_docs'),('customers'),
         ('doc_counters'),('doc_templates'),('drive_config'),('drive_targets'),
         ('expense_categories'),('expenses'),('finance_reminders_log'),('finance_vault_meta'),
         ('financial_settings'),('fx_rates'),('income_entries'),('invites'),('invoice_items'),
         ('invoice_payments'),('invoices'),('league_seasons'),('member_reports'),
         ('member_salary_settings'),('note_attachments'),('note_comments'),('note_folders'),
         ('note_shares'),('note_tag_links'),('note_tags'),('notes'),('notifications'),
         ('payroll_entries'),('payroll_periods'),('profiles'),('projects'),('references'),
         ('season_scores'),('subscriptions_expense'),('subscriptions_income'),
         ('task_assignees'),('task_comments'),('task_files'),('task_point_awards'),('tasks'),
         ('user_badges'),('user_sessions'),('work_sessions')
)
select r.name as missing_table
  from required r
 where not exists (
   select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = r.name
 )
 order by 1;

-- 2) إنشاء backup_error_log (سجل أخطاء النسخ الاحتياطي ومزامنة Drive)
create table if not exists public.backup_error_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  message    text not null,
  file       text,
  folder_id  text,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists backup_error_log_created_at_idx
  on public.backup_error_log (created_at desc);

grant select, delete on public.backup_error_log to authenticated;
grant all on public.backup_error_log to service_role;

alter table public.backup_error_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'backup_error_log'
       and policyname = 'master admin reads backup errors'
  ) then
    create policy "master admin reads backup errors"
      on public.backup_error_log for select to authenticated
      using (exists (
        select 1 from public.profiles p
         where p.id = auth.uid() and p.is_master_admin
      ));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'backup_error_log'
       and policyname = 'master admin clears backup errors'
  ) then
    create policy "master admin clears backup errors"
      on public.backup_error_log for delete to authenticated
      using (exists (
        select 1 from public.profiles p
         where p.id = auth.uid() and p.is_master_admin
      ));
  end if;
end $$;

-- 3) تحقّق بعد التنفيذ: يجب أن تخرج القائمة فارغة
with required(name) as (
  values ('activity_log'),('app_config'),('backup_drive_files'),('backup_error_log'),
         ('backup_requests'),('business_doc_revisions'),('business_docs'),('customers'),
         ('doc_counters'),('doc_templates'),('drive_config'),('drive_targets'),
         ('expense_categories'),('expenses'),('finance_reminders_log'),('finance_vault_meta'),
         ('financial_settings'),('fx_rates'),('income_entries'),('invites'),('invoice_items'),
         ('invoice_payments'),('invoices'),('league_seasons'),('member_reports'),
         ('member_salary_settings'),('note_attachments'),('note_comments'),('note_folders'),
         ('note_shares'),('note_tag_links'),('note_tags'),('notes'),('notifications'),
         ('payroll_entries'),('payroll_periods'),('profiles'),('projects'),('references'),
         ('season_scores'),('subscriptions_expense'),('subscriptions_income'),
         ('task_assignees'),('task_comments'),('task_files'),('task_point_awards'),('tasks'),
         ('user_badges'),('user_sessions'),('work_sessions')
)
select r.name as still_missing
  from required r
 where not exists (
   select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = r.name
 )
 order by 1;

-- 4) تحديث ذاكرة الـ API فوراً
notify pgrst, 'reload schema';
