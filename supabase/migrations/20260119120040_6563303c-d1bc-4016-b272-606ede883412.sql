-- Drop the overly permissive audit_logs insert policy
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Create a more restrictive policy for audit_logs insert
CREATE POLICY "Authenticated users can insert audit logs for their unit"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
  unit_id IS NULL OR unit_id = public.get_user_unit_id(auth.uid())
);