-- Add RLS policy for painel users to view tickets in their unit
CREATE POLICY "Panel users can view tickets in their unit"
ON public.tickets
FOR SELECT
USING (
  has_role(auth.uid(), 'painel'::app_role) 
  AND unit_id = get_user_unit_id(auth.uid())
);