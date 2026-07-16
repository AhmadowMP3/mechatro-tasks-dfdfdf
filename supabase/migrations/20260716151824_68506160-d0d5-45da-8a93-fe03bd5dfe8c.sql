ALTER TABLE public.user_badges
  DROP CONSTRAINT user_badges_user_id_fkey,
  ADD  CONSTRAINT user_badges_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.season_scores
  DROP CONSTRAINT season_scores_user_id_fkey,
  ADD  CONSTRAINT season_scores_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;