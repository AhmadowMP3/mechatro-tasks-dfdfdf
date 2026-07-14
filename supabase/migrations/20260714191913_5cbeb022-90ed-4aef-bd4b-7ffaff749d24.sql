
-- =========================================================
-- 1) task_point_awards table
-- =========================================================
CREATE TABLE public.task_point_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0 AND points <= 1000),
  awarded_amount integer,
  awarded_at timestamptz,
  awarded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX idx_tpa_task ON public.task_point_awards(task_id);
CREATE INDEX idx_tpa_user ON public.task_point_awards(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_point_awards TO authenticated;
GRANT ALL ON public.task_point_awards TO service_role;

ALTER TABLE public.task_point_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpa_admin_all"
  ON public.task_point_awards
  FOR ALL
  TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "tpa_self_read"
  ON public.task_point_awards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_tpa_updated_at
  BEFORE UPDATE ON public.task_point_awards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 2) Helper: award to a specific user (used by trigger)
-- =========================================================
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

-- =========================================================
-- 3) Rewrite award_task_points to support per-assignee awards
-- =========================================================
CREATE OR REPLACE FUNCTION public.award_task_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_award INTEGER;
  v_has_awards BOOLEAN;
BEGIN
  IF NEW.status IS DISTINCT FROM 'done'::public.task_status
     OR OLD.status = 'done'::public.task_status
     OR NEW.points_awarded_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.task_point_awards
     WHERE task_id = NEW.id AND points > 0
  ) INTO v_has_awards;

  IF v_has_awards THEN
    NEW.points_awarded_at := now();
    NEW.points_awarded_amount := 0;

    FOR v_row IN
      SELECT id, user_id, points FROM public.task_point_awards
       WHERE task_id = NEW.id AND awarded_at IS NULL AND points > 0
    LOOP
      v_award := public.award_points_to_user(NEW, v_row.user_id, v_row.points);
      UPDATE public.task_point_awards
         SET awarded_amount = v_award,
             awarded_at = now()
       WHERE id = v_row.id;
      NEW.points_awarded_amount := COALESCE(NEW.points_awarded_amount, 0) + v_award;
    END LOOP;

    RETURN NEW;
  END IF;

  -- Legacy single-assignee path
  IF NEW.assignee_id IS NULL OR COALESCE(NEW.points, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_award := public.award_points_to_user(NEW, NEW.assignee_id, NEW.points);
  NEW.points_awarded_at := now();
  NEW.points_awarded_amount := v_award;

  RETURN NEW;
END;
$function$;
