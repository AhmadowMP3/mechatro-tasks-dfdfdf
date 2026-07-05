-- Allow admins (non-master) to request a backup and see their own pending requests
CREATE POLICY "admins insert backup requests" ON public.backup_requests
FOR INSERT TO authenticated
WITH CHECK (
  private.is_admin(auth.uid())
  AND status = 'pending'
  AND requested_by = auth.uid()
);

CREATE POLICY "admins read own backup requests" ON public.backup_requests
FOR SELECT TO authenticated
USING (requested_by = auth.uid() AND private.is_admin(auth.uid()));