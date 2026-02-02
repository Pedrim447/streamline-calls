-- Allow admins to delete tickets in their unit
CREATE POLICY "Admins can delete tickets in their unit"
ON public.tickets
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND unit_id = get_user_unit_id(auth.uid())
);