ALTER TABLE public.note_shares
  DROP CONSTRAINT IF EXISTS note_shares_shared_with_user_id_fkey;

ALTER TABLE public.note_shares
  ADD CONSTRAINT note_shares_shared_with_user_id_fkey
  FOREIGN KEY (shared_with_user_id)
  REFERENCES public.profiles(id) ON DELETE CASCADE;