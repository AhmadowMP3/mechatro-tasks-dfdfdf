CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins (and server-side/service_role work) may change anything.
  IF auth.uid() IS NULL OR private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Self-service edits can never touch privileged fields.
  NEW.role := OLD.role;
  NEW.is_master_admin := OLD.is_master_admin;
  NEW.is_finance_admin := OLD.is_finance_admin;
  NEW.active := OLD.active;
  NEW.status := OLD.status;
  NEW.total_points := OLD.total_points;
  NEW.current_streak := OLD.current_streak;
  NEW.longest_streak := OLD.longest_streak;
  NEW.max_devices := OLD.max_devices;
  NEW.invited_by := OLD.invited_by;
  NEW.invited_at := OLD.invited_at;
  NEW.suspended_by := OLD.suspended_by;
  NEW.suspended_at := OLD.suspended_at;
  NEW.suspend_reason := OLD.suspend_reason;
  NEW.email := OLD.email;
  NEW.username := OLD.username;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_fields ON public.profiles;
CREATE TRIGGER guard_profile_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_fields();