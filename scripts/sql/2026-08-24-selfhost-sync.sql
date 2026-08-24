-- ============================================================================
-- Mechatro — Self-hosted Supabase sync  (2026-08-24)
-- Target: https://supabase.mechatro-sy.com  →  SQL Editor → paste → Run
--
-- Brings the self-hosted database up to date with the latest app changes:
--   1) Business documents system (quotation / RFQ / offer / invoice / PI / PO)
--   2) Badge + season foreign keys repointed to public.profiles
--   3) New points engine: settle_task_points() + triggers + grants
--   4) Full recalculation of points for all completed tasks
--   5) Removal of the retired share_links feature
--   6) Verification queries (last section — read the output)
--
-- 100% idempotent: safe to run as many times as you want.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) BUSINESS DOCUMENTS SYSTEM
-- ============================================================================
-- ── Enums ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.business_doc_type AS ENUM ('quotation','rfq','offer','invoice','proforma_invoice','purchase_order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.business_doc_status AS ENUM ('draft','sent','accepted','rejected','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Templates (editable header / footer / defaults per doc type) ───────
CREATE TABLE IF NOT EXISTS public.doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type public.business_doc_type NOT NULL,
  name text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT true,
  header jsonb NOT NULL DEFAULT '{}'::jsonb,
  footer jsonb NOT NULL DEFAULT '{}'::jsonb,
  defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS doc_templates_default_per_type
  ON public.doc_templates (doc_type) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_templates TO authenticated;
GRANT ALL ON public.doc_templates TO service_role;
ALTER TABLE public.doc_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_templates_master ON public.doc_templates;
CREATE POLICY doc_templates_master ON public.doc_templates FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

-- ── Documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type public.business_doc_type NOT NULL,
  number text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  title text NOT NULL DEFAULT '',
  client jsonb NOT NULL DEFAULT '{}'::jsonb,
  lang text NOT NULL DEFAULT 'en',
  theme text NOT NULL DEFAULT 'light',
  currency text NOT NULL DEFAULT 'USD',
  model jsonb NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  header_override jsonb,
  footer_override jsonb,
  status public.business_doc_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT current_date,
  valid_until date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_docs_lang_chk CHECK (lang IN ('ar','en')),
  CONSTRAINT business_docs_theme_chk CHECK (theme IN ('light','dark'))
);
CREATE INDEX IF NOT EXISTS business_docs_type_created_idx ON public.business_docs (doc_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS business_docs_number_rev_key ON public.business_docs (number, revision);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_docs TO authenticated;
GRANT ALL ON public.business_docs TO service_role;
ALTER TABLE public.business_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_docs_master ON public.business_docs;
CREATE POLICY business_docs_master ON public.business_docs FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

-- ── Revision snapshots ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_doc_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.business_docs(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  number text NOT NULL,
  model jsonb NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  header_override jsonb,
  footer_override jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_doc_revisions_doc_idx ON public.business_doc_revisions (doc_id, revision DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_doc_revisions TO authenticated;
GRANT ALL ON public.business_doc_revisions TO service_role;
ALTER TABLE public.business_doc_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_doc_revisions_master ON public.business_doc_revisions;
CREATE POLICY business_doc_revisions_master ON public.business_doc_revisions FOR ALL TO authenticated
  USING (private.is_master_admin(auth.uid())) WITH CHECK (private.is_master_admin(auth.uid()));

-- ── Per-type / per-year counters ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_counters (
  doc_type public.business_doc_type NOT NULL,
  year integer NOT NULL,
  seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, year)
);
GRANT SELECT ON public.doc_counters TO authenticated;
GRANT ALL ON public.doc_counters TO service_role;
ALTER TABLE public.doc_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_counters_master ON public.doc_counters;
CREATE POLICY doc_counters_master ON public.doc_counters FOR SELECT TO authenticated
  USING (private.is_master_admin(auth.uid()));

-- ── updated_at triggers ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS doc_templates_touch ON public.doc_templates;
CREATE TRIGGER doc_templates_touch BEFORE UPDATE ON public.doc_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS business_docs_touch ON public.business_docs;
CREATE TRIGGER business_docs_touch BEFORE UPDATE ON public.business_docs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Number generator: Mktro-QT-011-24-08-26-R01 ───────────────────────
CREATE OR REPLACE FUNCTION public.doc_type_prefix(_type public.business_doc_type)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _type
    WHEN 'quotation' THEN 'QT'
    WHEN 'rfq' THEN 'RFQ'
    WHEN 'offer' THEN 'OF'
    WHEN 'invoice' THEN 'INV'
    WHEN 'proforma_invoice' THEN 'PI'
    WHEN 'purchase_order' THEN 'PO'
  END $$;

CREATE OR REPLACE FUNCTION public.next_doc_number(_type public.business_doc_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer := EXTRACT(YEAR FROM current_date)::int;
  n integer;
BEGIN
  IF NOT private.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.doc_counters (doc_type, year, seq)
  VALUES (_type, y, 1)
  ON CONFLICT (doc_type, year) DO UPDATE SET seq = public.doc_counters.seq + 1
  RETURNING seq INTO n;

  RETURN 'Mktro-' || public.doc_type_prefix(_type) || '-' || lpad(n::text, 3, '0')
    || '-' || to_char(current_date, 'DD-MM-YY') || '-R01';
END $$;

GRANT EXECUTE ON FUNCTION public.next_doc_number(public.business_doc_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doc_type_prefix(public.business_doc_type) TO authenticated;
CREATE OR REPLACE FUNCTION public.doc_type_prefix(_type public.business_doc_type)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _type
    WHEN 'quotation' THEN 'QT'
    WHEN 'rfq' THEN 'RFQ'
    WHEN 'offer' THEN 'OF'
    WHEN 'invoice' THEN 'INV'
    WHEN 'proforma_invoice' THEN 'PI'
    WHEN 'purchase_order' THEN 'PO'
  END $$;

REVOKE ALL ON FUNCTION public.next_doc_number(public.business_doc_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_doc_number(public.business_doc_type) TO authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;

-- ============================================================================
-- 2) BADGES / SEASON SCORES → public.profiles
--    (fixes: "user_badges_user_id_fkey" violation when awarding points to a
--     member that has a profile but no auth.users row)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class r ON r.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = r.relnamespace
     WHERE c.conname = 'user_badges_user_id_fkey'
       AND t.relname = 'user_badges'
       AND NOT (rn.nspname = 'public' AND r.relname = 'profiles')
  ) THEN
    ALTER TABLE public.user_badges DROP CONSTRAINT user_badges_user_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_badges_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_badges
      ADD CONSTRAINT user_badges_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class r ON r.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = r.relnamespace
     WHERE c.conname = 'season_scores_user_id_fkey'
       AND t.relname = 'season_scores'
       AND NOT (rn.nspname = 'public' AND r.relname = 'profiles')
  ) THEN
    ALTER TABLE public.season_scores DROP CONSTRAINT season_scores_user_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'season_scores_user_id_fkey'
  ) THEN
    ALTER TABLE public.season_scores
      ADD CONSTRAINT season_scores_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 3) POINTS ENGINE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.award_points_to_user(
  p_task public.tasks,
  p_user_id uuid,
  p_base_points integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_award INTEGER;
  v_bonus INTEGER := 0;
  v_streak INTEGER := 0;
  v_last_done DATE;
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_multiplier NUMERIC := 1.0;
  v_new_total INTEGER;
  v_season RECORD;
  v_prev_rank INTEGER;
  v_new_rank INTEGER;
  v_projects_done INTEGER;
  v_approvals INTEGER;
  v_body TEXT;
BEGIN
  IF p_user_id IS NULL OR COALESCE(p_base_points, 0) <= 0 THEN
    RETURN 0;
  END IF;

  SELECT current_streak, last_task_done_on
    INTO v_streak, v_last_done
    FROM public.profiles WHERE id = p_user_id;

  IF v_last_done IS NULL OR v_last_done < v_today - INTERVAL '1 day' THEN
    v_streak := 1;
  ELSIF v_last_done = v_today - INTERVAL '1 day' THEN
    v_streak := COALESCE(v_streak, 0) + 1;
  END IF;

  IF v_streak >= 7 THEN v_multiplier := 1.25;
  ELSIF v_streak >= 3 THEN v_multiplier := 1.10;
  END IF;

  v_award := GREATEST(1, ROUND(p_base_points * v_multiplier))::INTEGER;
  v_bonus := v_award - p_base_points;

  UPDATE public.profiles
     SET total_points = total_points + v_award,
         current_streak = v_streak,
         longest_streak = GREATEST(longest_streak, v_streak),
         last_task_done_on = v_today
   WHERE id = p_user_id
  RETURNING total_points INTO v_new_total;

  FOR v_season IN
    SELECT s.id, s.name
      FROM public.league_seasons s
     WHERE s.status = 'active'
       AND now() >= s.starts_at AND now() < s.ends_at
       AND (s.scope = 'global' OR s.project_id = p_task.project_id)
  LOOP
    SELECT last_rank INTO v_prev_rank
      FROM public.season_scores WHERE season_id = v_season.id AND user_id = p_user_id;

    INSERT INTO public.season_scores (season_id, user_id, points, tasks_done, updated_at)
    VALUES (v_season.id, p_user_id, v_award, 1, now())
    ON CONFLICT (season_id, user_id) DO UPDATE
      SET points = public.season_scores.points + EXCLUDED.points,
          tasks_done = public.season_scores.tasks_done + 1,
          updated_at = now();

    WITH ranked AS (
      SELECT user_id, RANK() OVER (ORDER BY points DESC, tasks_done DESC) AS r
        FROM public.season_scores WHERE season_id = v_season.id
    )
    UPDATE public.season_scores ss
       SET last_rank = ranked.r
      FROM ranked
     WHERE ss.season_id = v_season.id AND ss.user_id = ranked.user_id;

    SELECT last_rank INTO v_new_rank
      FROM public.season_scores WHERE season_id = v_season.id AND user_id = p_user_id;

    IF v_prev_rank IS NOT NULL AND v_new_rank < v_prev_rank THEN
      IF v_new_rank = 1 THEN
        INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
        VALUES (p_user_id, 'first_place',
          '🏆 أصبحت الأول في ' || v_season.name,
          '🏆 You just took #1 in ' || v_season.name,
          NULL, v_season.id);
      ELSE
        INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
        VALUES (p_user_id, 'rank_up',
          'ترتيبك تحسّن!',
          'You moved up!',
          'من #' || v_prev_rank || ' إلى #' || v_new_rank || ' — ' || v_season.name,
          v_season.id);
      END IF;
    ELSIF v_prev_rank IS NULL AND v_new_rank = 1 THEN
      INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
      VALUES (p_user_id, 'first_place',
        '🏆 أصبحت الأول في ' || v_season.name,
        '🏆 You just took #1 in ' || v_season.name,
        NULL, v_season.id);
    END IF;
  END LOOP;

  v_body := '+' || v_award || ' pts — ' || p_task.title;
  IF v_bonus > 0 THEN
    v_body := v_body || ' (streak bonus +' || v_bonus || ')';
  END IF;
  INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
  VALUES (p_user_id, 'points_earned',
    'حصلت على ' || v_award || ' نقطة',
    'You earned ' || v_award || ' points',
    v_body, p_task.id);

  IF NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'first_blood') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'first_blood') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '🎖 أول مهمة!', '🎖 First Blood!', 'First approved task', p_user_id);
  END IF;

  IF v_new_total >= 100 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'century') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'century') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '🎖 100 نقطة', '🎖 Century (100 pts)', NULL, p_user_id);
  END IF;
  IF v_new_total >= 500 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'half_k') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'half_k') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '🎖 500 نقطة', '🎖 Half-K (500 pts)', NULL, p_user_id);
  END IF;
  IF v_new_total >= 1000 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'kilo') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'kilo') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '🎖 1000 نقطة', '🎖 Kilo (1000 pts)', NULL, p_user_id);
  END IF;

  IF v_streak >= 7 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'on_fire') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'on_fire') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '🔥 مشتعل!', '🔥 On Fire (7-day streak)', NULL, p_user_id);
  END IF;

  IF p_task.due_date IS NOT NULL AND v_today <= p_task.due_date - 2
     AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'speed_demon') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'speed_demon') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '⚡ سرعة البرق', '⚡ Speed Demon', 'Delivered early', p_user_id);
  END IF;

  SELECT COUNT(DISTINCT project_id) INTO v_projects_done
    FROM public.tasks
   WHERE assignee_id = p_user_id AND points_awarded_at IS NOT NULL;
  IF v_projects_done >= 3 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'team_player') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'team_player') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '🤝 لاعب فريق', '🤝 Team Player', '3+ projects', p_user_id);
  END IF;

  SELECT COUNT(*) INTO v_approvals FROM public.tasks
    WHERE assignee_id = p_user_id AND points_awarded_at IS NOT NULL;
  IF v_approvals >= 10 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND code = 'perfectionist') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (p_user_id, 'perfectionist') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (p_user_id, 'badge_unlocked', '💎 متقن', '💎 Perfectionist', '10 approvals', p_user_id);
  END IF;

  RETURN v_award;
END;
$$;

REVOKE ALL ON FUNCTION public.award_points_to_user(public.tasks, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_points_to_user(public.tasks, uuid, integer) TO service_role;

-- Central, idempotent settlement of task points
CREATE OR REPLACE FUNCTION public.settle_task_points(p_task_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.tasks;
  v_row RECORD;
  v_award INTEGER;
  v_has_awards BOOLEAN;
  v_any_awarded BOOLEAN;
  v_total INTEGER := 0;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF v_task.id IS NULL OR v_task.status IS DISTINCT FROM 'done'::public.task_status THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.task_point_awards WHERE task_id = p_task_id AND points > 0),
         EXISTS (SELECT 1 FROM public.task_point_awards WHERE task_id = p_task_id AND awarded_at IS NOT NULL)
    INTO v_has_awards, v_any_awarded;

  IF v_has_awards THEN
    -- The task was previously credited through the legacy single-assignee path
    -- and a split has been added afterwards: undo the legacy credit first.
    IF NOT v_any_awarded
       AND v_task.points_awarded_at IS NOT NULL
       AND COALESCE(v_task.points_awarded_amount, 0) > 0
       AND v_task.assignee_id IS NOT NULL THEN
      UPDATE public.profiles
         SET total_points = GREATEST(0, total_points - v_task.points_awarded_amount)
       WHERE id = v_task.assignee_id;
      UPDATE public.tasks
         SET points_awarded_amount = 0, points_awarded_at = NULL
       WHERE id = p_task_id;
      v_task.points_awarded_amount := 0;
      v_task.points_awarded_at := NULL;
    END IF;

    FOR v_row IN
      SELECT id, user_id, points FROM public.task_point_awards
       WHERE task_id = p_task_id AND awarded_at IS NULL AND points > 0
    LOOP
      v_award := public.award_points_to_user(v_task, v_row.user_id, v_row.points);
      UPDATE public.task_point_awards
         SET awarded_amount = v_award, awarded_at = now()
       WHERE id = v_row.id;
      v_total := v_total + v_award;
    END LOOP;

    UPDATE public.tasks
       SET points_awarded_at = COALESCE(points_awarded_at, now()),
           points_awarded_amount = (
             SELECT COALESCE(SUM(COALESCE(awarded_amount, 0)), 0)
               FROM public.task_point_awards
              WHERE task_id = p_task_id AND awarded_at IS NOT NULL
           )
     WHERE id = p_task_id;

    RETURN v_total;
  END IF;

  -- Legacy single-assignee path
  IF v_task.points_awarded_at IS NOT NULL
     OR v_task.assignee_id IS NULL
     OR COALESCE(v_task.points, 0) <= 0 THEN
    RETURN 0;
  END IF;

  v_award := public.award_points_to_user(v_task, v_task.assignee_id, v_task.points);
  UPDATE public.tasks
     SET points_awarded_at = now(), points_awarded_amount = v_award
   WHERE id = p_task_id;
  RETURN v_award;
END;
$$;

-- Task trigger: settle whenever a task is (or becomes) done
CREATE OR REPLACE FUNCTION public.award_task_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF NEW.status = 'done'::public.task_status THEN
    PERFORM public.settle_task_points(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_task_points ON public.tasks;
CREATE TRIGGER trg_award_task_points
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.award_task_points();

-- Awards trigger: settle immediately when a split row is added/edited
CREATE OR REPLACE FUNCTION public.settle_awards_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM public.settle_task_points(NEW.task_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_settle_awards ON public.task_point_awards;
CREATE TRIGGER trg_settle_awards
AFTER INSERT OR UPDATE ON public.task_point_awards
FOR EACH ROW EXECUTE FUNCTION public.settle_awards_on_change();

GRANT EXECUTE ON FUNCTION public.settle_task_points(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_task_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_task_points(uuid) TO service_role;

-- ============================================================================
-- 4) FULL RECALCULATION FOR ALL COMPLETED TASKS
--    Settles every pending award, then rebuilds profile totals and season
--    scores from the awarded data. Notification triggers stay quiet.
-- ============================================================================
DO $$
DECLARE r RECORD;
BEGIN
  -- settle every done task (idempotent — already-awarded rows are skipped)
  FOR r IN SELECT id FROM public.tasks WHERE status = 'done'::public.task_status LOOP
    PERFORM public.settle_task_points(r.id);
  END LOOP;
END $$;

-- Rebuild profiles.total_points from awarded data
WITH split AS (
  SELECT user_id, SUM(COALESCE(awarded_amount, points)) AS pts
    FROM public.task_point_awards
   WHERE awarded_at IS NOT NULL
   GROUP BY user_id
),
legacy AS (
  SELECT t.assignee_id AS user_id, SUM(COALESCE(t.points_awarded_amount, 0)) AS pts
    FROM public.tasks t
   WHERE t.points_awarded_at IS NOT NULL
     AND t.assignee_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.task_point_awards a
        WHERE a.task_id = t.id AND a.awarded_at IS NOT NULL
     )
   GROUP BY t.assignee_id
),
totals AS (
  SELECT user_id, SUM(pts)::int AS pts
    FROM (SELECT * FROM split UNION ALL SELECT * FROM legacy) u
   GROUP BY user_id
)
UPDATE public.profiles p
   SET total_points = COALESCE(t.pts, 0)
  FROM (SELECT id FROM public.profiles) ids
  LEFT JOIN totals t ON t.user_id = ids.id
 WHERE p.id = ids.id
   AND p.total_points IS DISTINCT FROM COALESCE(t.pts, 0);

-- Rebuild season_scores from the same source of truth
DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN SELECT id, scope, project_id, starts_at, ends_at FROM public.league_seasons LOOP
    DELETE FROM public.season_scores WHERE season_id = s.id;

    INSERT INTO public.season_scores (season_id, user_id, points, tasks_done, updated_at)
    SELECT s.id, x.user_id, SUM(x.pts)::int, COUNT(DISTINCT x.task_id)::int, now()
      FROM (
        SELECT a.user_id, a.task_id, COALESCE(a.awarded_amount, a.points) AS pts
          FROM public.task_point_awards a
          JOIN public.tasks t ON t.id = a.task_id
         WHERE a.awarded_at IS NOT NULL
           AND a.awarded_at >= s.starts_at AND a.awarded_at < s.ends_at
           AND (s.scope = 'global'::public.season_scope OR t.project_id = s.project_id)
        UNION ALL
        SELECT t.assignee_id, t.id, COALESCE(t.points_awarded_amount, 0)
          FROM public.tasks t
         WHERE t.points_awarded_at IS NOT NULL
           AND t.assignee_id IS NOT NULL
           AND t.points_awarded_at >= s.starts_at AND t.points_awarded_at < s.ends_at
           AND (s.scope = 'global'::public.season_scope OR t.project_id = s.project_id)
           AND NOT EXISTS (
             SELECT 1 FROM public.task_point_awards a2
              WHERE a2.task_id = t.id AND a2.awarded_at IS NOT NULL
           )
      ) x
     WHERE x.user_id IS NOT NULL AND x.pts > 0
     GROUP BY x.user_id;

    WITH ranked AS (
      SELECT user_id, RANK() OVER (ORDER BY points DESC, tasks_done DESC) AS r
        FROM public.season_scores WHERE season_id = s.id
    )
    UPDATE public.season_scores ss
       SET last_rank = ranked.r
      FROM ranked
     WHERE ss.season_id = s.id AND ss.user_id = ranked.user_id;
  END LOOP;
END $$;

-- ============================================================================
-- 5) REMOVE THE RETIRED SHARE LINKS FEATURE
-- ============================================================================
DROP TABLE IF EXISTS public.share_links CASCADE;

COMMIT;

-- ============================================================================
-- 6) VERIFICATION — read these three results
-- ============================================================================

-- (a) must return 0 rows: awards on completed tasks that were never settled
SELECT a.task_id, a.user_id, a.points
  FROM public.task_point_awards a
  JOIN public.tasks t ON t.id = a.task_id
 WHERE t.status = 'done'::public.task_status
   AND a.awarded_at IS NULL
   AND a.points > 0;

-- (b) must return 0 rows: profile totals that disagree with awarded data
WITH split AS (
  SELECT user_id, SUM(COALESCE(awarded_amount, points)) AS pts
    FROM public.task_point_awards WHERE awarded_at IS NOT NULL GROUP BY user_id
),
legacy AS (
  SELECT t.assignee_id AS user_id, SUM(COALESCE(t.points_awarded_amount, 0)) AS pts
    FROM public.tasks t
   WHERE t.points_awarded_at IS NOT NULL AND t.assignee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.task_point_awards a
                      WHERE a.task_id = t.id AND a.awarded_at IS NOT NULL)
   GROUP BY t.assignee_id
),
totals AS (
  SELECT user_id, SUM(pts)::int AS pts
    FROM (SELECT * FROM split UNION ALL SELECT * FROM legacy) u GROUP BY user_id
)
SELECT p.id, p.full_name, p.total_points, COALESCE(t.pts, 0) AS expected
  FROM public.profiles p
  LEFT JOIN totals t ON t.user_id = p.id
 WHERE p.total_points IS DISTINCT FROM COALESCE(t.pts, 0);

-- (c) current balances (informational)
SELECT full_name, total_points, current_streak
  FROM public.profiles
 WHERE active
 ORDER BY total_points DESC;

-- (d) business documents objects exist (informational — expect 4 rows)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('doc_templates','business_docs','business_doc_revisions','doc_counters')
 ORDER BY table_name;
