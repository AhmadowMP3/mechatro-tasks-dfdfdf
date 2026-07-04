
-- =========================================
-- 1. Task points
-- =========================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0
    CHECK (points >= 0 AND points <= 1000),
  ADD COLUMN IF NOT EXISTS points_awarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS points_awarded_amount INTEGER;

-- =========================================
-- 2. Profile stats
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_task_done_on DATE;

-- =========================================
-- 3. League seasons
-- =========================================
DO $$ BEGIN
  CREATE TYPE public.season_scope AS ENUM ('global','project');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.season_status AS ENUM ('upcoming','active','ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.league_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  scope public.season_scope NOT NULL DEFAULT 'global',
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status public.season_status NOT NULL DEFAULT 'active',
  winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

GRANT SELECT ON public.league_seasons TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.league_seasons TO authenticated; -- gated by RLS
GRANT ALL ON public.league_seasons TO service_role;
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seasons_select_all" ON public.league_seasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "seasons_admin_write" ON public.league_seasons FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_league_seasons_status ON public.league_seasons(status);
CREATE INDEX IF NOT EXISTS idx_league_seasons_dates ON public.league_seasons(starts_at, ends_at);

CREATE TRIGGER league_seasons_set_updated_at
  BEFORE UPDATE ON public.league_seasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 4. Season scores
-- =========================================
CREATE TABLE IF NOT EXISTS public.season_scores (
  season_id UUID NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  tasks_done INTEGER NOT NULL DEFAULT 0,
  last_rank INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

GRANT SELECT ON public.season_scores TO authenticated;
GRANT ALL ON public.season_scores TO service_role;
ALTER TABLE public.season_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "season_scores_select_all" ON public.season_scores FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_season_scores_season_points ON public.season_scores(season_id, points DESC);

-- =========================================
-- 5. User badges
-- =========================================
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, code)
);

GRANT SELECT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_badges_select_all" ON public.user_badges FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);

-- =========================================
-- 6. Award trigger (main scoring logic)
-- =========================================
CREATE OR REPLACE FUNCTION public.award_task_points()
RETURNS TRIGGER
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
  -- Only fire on status change into 'done'
  IF NEW.status IS DISTINCT FROM 'done'::public.task_status
     OR OLD.status = 'done'::public.task_status
     OR NEW.assignee_id IS NULL
     OR COALESCE(NEW.points,0) <= 0
     OR NEW.points_awarded_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  -- Streak update
  SELECT current_streak, last_task_done_on
    INTO v_streak, v_last_done
    FROM public.profiles WHERE id = NEW.assignee_id;

  IF v_last_done IS NULL OR v_last_done < v_today - INTERVAL '1 day' THEN
    v_streak := 1;
  ELSIF v_last_done = v_today - INTERVAL '1 day' THEN
    v_streak := COALESCE(v_streak,0) + 1;
  END IF;
  -- same-day repeat: unchanged

  IF v_streak >= 7 THEN v_multiplier := 1.25;
  ELSIF v_streak >= 3 THEN v_multiplier := 1.10;
  END IF;

  v_award := GREATEST(1, ROUND(NEW.points * v_multiplier))::INTEGER;
  v_bonus := v_award - NEW.points;

  -- Mark task as awarded (idempotent guard)
  NEW.points_awarded_at := now();
  NEW.points_awarded_amount := v_award;

  -- Update profile totals + streak
  UPDATE public.profiles
     SET total_points = total_points + v_award,
         current_streak = v_streak,
         longest_streak = GREATEST(longest_streak, v_streak),
         last_task_done_on = v_today
   WHERE id = NEW.assignee_id
  RETURNING total_points INTO v_new_total;

  -- Upsert per active season this task belongs to
  FOR v_season IN
    SELECT s.id, s.name
      FROM public.league_seasons s
     WHERE s.status = 'active'
       AND now() >= s.starts_at AND now() < s.ends_at
       AND (s.scope = 'global' OR s.project_id = NEW.project_id)
  LOOP
    SELECT last_rank INTO v_prev_rank
      FROM public.season_scores WHERE season_id = v_season.id AND user_id = NEW.assignee_id;

    INSERT INTO public.season_scores (season_id, user_id, points, tasks_done, updated_at)
    VALUES (v_season.id, NEW.assignee_id, v_award, 1, now())
    ON CONFLICT (season_id, user_id) DO UPDATE
      SET points = public.season_scores.points + EXCLUDED.points,
          tasks_done = public.season_scores.tasks_done + 1,
          updated_at = now();

    -- Recompute ranks for this season
    WITH ranked AS (
      SELECT user_id, RANK() OVER (ORDER BY points DESC, tasks_done DESC) AS r
        FROM public.season_scores WHERE season_id = v_season.id
    )
    UPDATE public.season_scores ss
       SET last_rank = ranked.r
      FROM ranked
     WHERE ss.season_id = v_season.id AND ss.user_id = ranked.user_id;

    SELECT last_rank INTO v_new_rank
      FROM public.season_scores WHERE season_id = v_season.id AND user_id = NEW.assignee_id;

    -- Rank up notification
    IF v_prev_rank IS NOT NULL AND v_new_rank < v_prev_rank THEN
      IF v_new_rank = 1 THEN
        INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
        VALUES (NEW.assignee_id, 'first_place',
          '🏆 أصبحت الأول في ' || v_season.name,
          '🏆 You just took #1 in ' || v_season.name,
          NULL, v_season.id);
      ELSE
        INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
        VALUES (NEW.assignee_id, 'rank_up',
          'ترتيبك تحسّن!',
          'You moved up!',
          'من #' || v_prev_rank || ' إلى #' || v_new_rank || ' — ' || v_season.name,
          v_season.id);
      END IF;
    ELSIF v_prev_rank IS NULL AND v_new_rank = 1 THEN
      INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
      VALUES (NEW.assignee_id, 'first_place',
        '🏆 أصبحت الأول في ' || v_season.name,
        '🏆 You just took #1 in ' || v_season.name,
        NULL, v_season.id);
    END IF;
  END LOOP;

  -- Points earned notification
  v_body := '+' || v_award || ' pts — ' || NEW.title;
  IF v_bonus > 0 THEN
    v_body := v_body || ' (streak bonus +' || v_bonus || ')';
  END IF;
  INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
  VALUES (NEW.assignee_id, 'points_earned',
    'حصلت على ' || v_award || ' نقطة',
    'You earned ' || v_award || ' points',
    v_body, NEW.id);

  -- Badges
  -- first_blood: any prior awarded task?
  IF NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'first_blood') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'first_blood')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '🎖 أول مهمة!', '🎖 First Blood!', 'First approved task', NEW.assignee_id);
  END IF;

  -- Milestone badges
  IF v_new_total >= 100 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'century') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'century') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '🎖 100 نقطة', '🎖 Century (100 pts)', NULL, NEW.assignee_id);
  END IF;
  IF v_new_total >= 500 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'half_k') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'half_k') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '🎖 500 نقطة', '🎖 Half-K (500 pts)', NULL, NEW.assignee_id);
  END IF;
  IF v_new_total >= 1000 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'kilo') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'kilo') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '🎖 1000 نقطة', '🎖 Kilo (1000 pts)', NULL, NEW.assignee_id);
  END IF;

  -- Streak badges
  IF v_streak >= 7 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'on_fire') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'on_fire') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '🔥 مشتعل!', '🔥 On Fire (7-day streak)', NULL, NEW.assignee_id);
  END IF;

  -- speed_demon: completed 2+ days before due_date
  IF NEW.due_date IS NOT NULL AND v_today <= NEW.due_date - 2
     AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'speed_demon') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'speed_demon') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '⚡ سرعة البرق', '⚡ Speed Demon', 'Delivered early', NEW.assignee_id);
  END IF;

  -- team_player: 3+ distinct projects with approved tasks
  SELECT COUNT(DISTINCT project_id) INTO v_projects_done
    FROM public.tasks
   WHERE assignee_id = NEW.assignee_id AND points_awarded_at IS NOT NULL;
  IF v_projects_done >= 3 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'team_player') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'team_player') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '🤝 لاعب فريق', '🤝 Team Player', '3+ projects', NEW.assignee_id);
  END IF;

  -- perfectionist: 10 approvals total
  SELECT COUNT(*) INTO v_approvals FROM public.tasks
    WHERE assignee_id = NEW.assignee_id AND points_awarded_at IS NOT NULL;
  IF v_approvals >= 10 AND NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.assignee_id AND code = 'perfectionist') THEN
    INSERT INTO public.user_badges (user_id, code) VALUES (NEW.assignee_id, 'perfectionist') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
    VALUES (NEW.assignee_id, 'badge_unlocked', '💎 متقن', '💎 Perfectionist', '10 approvals', NEW.assignee_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_task_points ON public.tasks;
CREATE TRIGGER trg_award_task_points
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.award_task_points();

-- =========================================
-- 7. Season close helper (called manually or via cron)
-- =========================================
CREATE OR REPLACE FUNCTION public.close_ended_seasons()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season RECORD;
  v_winner UUID;
  v_runner UUID;
  v_row RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_season IN
    SELECT * FROM public.league_seasons
     WHERE status = 'active' AND ends_at <= now()
  LOOP
    SELECT user_id INTO v_winner FROM public.season_scores
      WHERE season_id = v_season.id ORDER BY points DESC, tasks_done DESC LIMIT 1;
    SELECT user_id INTO v_runner FROM public.season_scores
      WHERE season_id = v_season.id ORDER BY points DESC, tasks_done DESC OFFSET 1 LIMIT 1;

    UPDATE public.league_seasons
       SET status = 'ended', winner_user_id = v_winner, updated_at = now()
     WHERE id = v_season.id;

    -- Summary notifications for every scorer
    FOR v_row IN
      SELECT ss.user_id, ss.points, ss.last_rank FROM public.season_scores ss
       WHERE ss.season_id = v_season.id
    LOOP
      INSERT INTO public.notifications (user_id, type, title_ar, title_en, body, entity_id)
      VALUES (v_row.user_id, 'season_summary',
        'انتهى ' || v_season.name,
        v_season.name || ' ended',
        'المركز #' || COALESCE(v_row.last_rank, 0) || ' بـ ' || v_row.points || ' نقطة',
        v_season.id);
    END LOOP;

    IF v_winner IS NOT NULL THEN
      INSERT INTO public.user_badges (user_id, code, meta)
      VALUES (v_winner, 'champion', jsonb_build_object('season_id', v_season.id, 'season_name', v_season.name))
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_runner IS NOT NULL THEN
      INSERT INTO public.user_badges (user_id, code, meta)
      VALUES (v_runner, 'runner_up', jsonb_build_object('season_id', v_season.id, 'season_name', v_season.name))
      ON CONFLICT DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_ended_seasons() TO authenticated, service_role;
