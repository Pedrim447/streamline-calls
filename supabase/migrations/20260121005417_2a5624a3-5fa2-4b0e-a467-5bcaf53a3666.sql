-- Allow attendants to update counters to assign/release themselves
-- Drop the existing admin-only policy and create a more permissive one

DROP POLICY IF EXISTS "Admins can manage counters" ON public.counters;

-- Admins can do everything on counters
CREATE POLICY "Admins can manage counters" 
ON public.counters 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND unit_id = get_user_unit_id(auth.uid())
);

-- Attendants can update counters to assign/release themselves
CREATE POLICY "Attendants can assign themselves to counters" 
ON public.counters 
FOR UPDATE 
USING (
  unit_id = get_user_unit_id(auth.uid())
  AND (
    -- Counter is available (no one assigned) or assigned to current user
    current_attendant_id IS NULL 
    OR current_attendant_id = auth.uid()
  )
)
WITH CHECK (
  unit_id = get_user_unit_id(auth.uid())
  AND (
    -- Can only assign themselves or release
    current_attendant_id IS NULL 
    OR current_attendant_id = auth.uid()
  )
);