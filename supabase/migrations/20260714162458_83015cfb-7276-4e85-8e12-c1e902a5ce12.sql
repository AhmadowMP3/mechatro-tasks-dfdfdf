
-- ============ WIPE ALL DATA ============
SET session_replication_role = 'replica'; -- disable triggers during wipe

TRUNCATE TABLE
  public.task_files,
  public.task_comments,
  public.task_assignees,
  public.tasks,
  public.note_attachments,
  public.note_comments,
  public.note_shares,
  public.note_tag_links,
  public.note_tags,
  public.note_folders,
  public.notes,
  public.invoice_payments,
  public.invoice_items,
  public.invoices,
  public.expenses,
  public.income_entries,
  public.subscriptions_income,
  public.subscriptions_expense,
  public.finance_reminders_log,
  public.customers,
  public.expense_categories,
  public.fx_rates,
  public.payroll_entries,
  public.payroll_periods,
  public.member_salary_settings,
  public.member_reports,
  public.season_scores,
  public.league_seasons,
  public.user_badges,
  public.notifications,
  public.activity_log,
  public.work_sessions,
  public.user_sessions,
  public.share_links,
  public.backup_requests,
  public.references,
  public.invites,
  public.projects,
  public.profiles
RESTART IDENTITY CASCADE;

-- Delete auth identities & users
DELETE FROM auth.identities;
DELETE FROM auth.users;

SET session_replication_role = 'origin';

-- ============ CONFIG ============
UPDATE public.app_config SET master_admin_email = 'zizo@mechatro.com' WHERE id = true;
INSERT INTO public.app_config (id, master_admin_email)
SELECT true, 'zizo@mechatro.com'
WHERE NOT EXISTS (SELECT 1 FROM public.app_config WHERE id = true);

-- ============ SEED 3 USERS ============
DO $$
DECLARE
  v_zizo   uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_ahmad  uuid := gen_random_uuid();
  v_pwd    text := 'Mechatro@2026';
BEGIN
  -- auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', v_zizo,   'authenticated', 'authenticated',
     'zizo@mechatro.com', crypt(v_pwd, gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Zizo'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_client, 'authenticated', 'authenticated',
     'client@mechatro.com', crypt(v_pwd, gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Client'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_ahmad,  'authenticated', 'authenticated',
     'ahmad@mechatro.com', crypt(v_pwd, gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name','Ahmad'),
     now(), now(), '', '', '', '');

  -- auth.identities
  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_zizo::text,   v_zizo,   jsonb_build_object('sub', v_zizo::text,   'email','zizo@mechatro.com',   'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_client::text, v_client, jsonb_build_object('sub', v_client::text, 'email','client@mechatro.com', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_ahmad::text,  v_ahmad,  jsonb_build_object('sub', v_ahmad::text,  'email','ahmad@mechatro.com',  'email_verified', true), 'email', now(), now(), now());

  -- profiles (handle_new_user trigger already inserts a base row; upsert to set roles cleanly)
  INSERT INTO public.profiles (id, full_name, role, email, is_master_admin, status, active, is_finance_admin)
  VALUES
    (v_zizo,   'Zizo',   'admin'::app_role,  'zizo@mechatro.com',   true,  'active'::profile_status, true, true),
    (v_client, 'Client', 'admin'::app_role,  'client@mechatro.com', false, 'active'::profile_status, true, true),
    (v_ahmad,  'Ahmad',  'member'::app_role, 'ahmad@mechatro.com',  false, 'active'::profile_status, true, false)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    is_master_admin = EXCLUDED.is_master_admin,
    status = EXCLUDED.status,
    active = EXCLUDED.active,
    is_finance_admin = EXCLUDED.is_finance_admin;
END $$;
