
CREATE OR REPLACE FUNCTION public.restore_full_snapshot(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  IF auth.uid() IS NOT NULL AND NOT private.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'restore_full_snapshot: master admin only';
  END IF;

  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'restore_full_snapshot: payload must be a JSON object';
  END IF;

  -- Silence user-defined triggers (award points, activity log, notifications,
  -- FK guards, etc.) so restored rows land verbatim.
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
  END LOOP;

  -- Wipe everything (CASCADE handles any interdependencies not in the list).
  SELECT 'TRUNCATE TABLE ' || string_agg(format('public.%I', x), ', ') || ' RESTART IDENTITY CASCADE'
    INTO truncate_sql
    FROM unnest(tables) AS x;
  EXECUTE truncate_sql;

  -- Insert in parent-first order.
  FOREACH t IN ARRAY tables LOOP
    IF payload ? t AND jsonb_typeof(payload->t) = 'array' AND jsonb_array_length(payload->t) > 0 THEN
      BEGIN
        EXECUTE format(
          'INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1)',
          t, t
        ) USING payload->t;
        GET DIAGNOSTICS n = ROW_COUNT;
        counts := counts || jsonb_build_object(t, n);
      EXCEPTION WHEN OTHERS THEN
        counts := counts || jsonb_build_object(t, jsonb_build_object('error', SQLERRM));
      END;
    ELSE
      counts := counts || jsonb_build_object(t, 0);
    END IF;
  END LOOP;

  -- Re-enable triggers, even if inserts failed above.
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN counts;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_full_snapshot(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_full_snapshot(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.restore_full_snapshot(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_full_snapshot(jsonb) TO service_role;
