DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invites;  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.invites  REPLICA IDENTITY FULL;