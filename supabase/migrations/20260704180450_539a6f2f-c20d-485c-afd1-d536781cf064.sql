
ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles
   SET role = 'admin', status = 'active', active = true
 WHERE lower(email) = 'minimamba1608@gmail.com';
ALTER TABLE public.profiles ENABLE TRIGGER USER;
