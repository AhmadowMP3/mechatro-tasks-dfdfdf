
CREATE OR REPLACE FUNCTION public.restore_full_snapshot(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Dependency-ordered: parents first (inserts run in this order,
  -- truncate uses CASCADE so order there doesn't matter).
  tables text[] := ARRAY[
    'app_config','financial_settings','profiles','projects','references',
    'league_seasons','invites','share_links','customers','expense_categories',
    'fx_rates','invoices','invoice_items','invoice_payments','expenses',
    'income_entries','subscriptions_income','subscriptions_expense',
    'payroll_periods','payroll_entries','member_salary_settings',
    'finance_reminders_log','note_folders','note_tags','notes','note_tag_links',
    'note_shares','note_comments','note_attachments','tasks','task_assignees',
    'task_files','task_comments','task_point_awards','work_sessions',
    'season_scores','user_badges','member_reports','activity_log',
    'notifications','user_sessions'
  ];
  t text;
  n bigint;
  counts jsonb := '{}'::jsonb;
  truncate_sql text;
BEGIN
  -- Only the backup edge function (service_role) or a master admin may call this.
  IF auth.uid() IS NOT NULL AND NOT private.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'restore_full_snapshot: master admin only';
  END IF;

  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'restore_full_snapshot: payload must be a JSON object';
  END IF;

  -- Disable triggers + FK checks for the duration of this transaction.
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Wipe everything in one shot (CASCADE handles interdependencies).
  SELECT 'TRUNCATE TABLE ' || string_agg(format('public.%I', x), ', ') || ' RESTART IDENTITY CASCADE'
    INTO truncate_sql
    FROM unnest(tables) AS x;
  EXECUTE truncate_sql;

  -- Insert back in dependency order, skipping tables not present in the snapshot.
  FOREACH t IN ARRAY tables LOOP
    IF payload ? t AND jsonb_typeof(payload->t) = 'array' AND jsonb_array_length(payload->t) > 0 THEN
      EXECUTE format(
        'INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1)',
        t, t
      ) USING payload->t;
      GET DIAGNOSTICS n = ROW_COUNT;
      counts := counts || jsonb_build_object(t, n);
    ELSE
      counts := counts || jsonb_build_object(t, 0);
    END IF;
  END LOOP;

  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN counts;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_full_snapshot(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_full_snapshot(jsonb) TO service_role;
