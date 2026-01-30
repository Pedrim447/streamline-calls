-- Add public read policy for tickets (for public TV panel)
CREATE POLICY "Public can view called tickets"
ON public.tickets
FOR SELECT
USING (status IN ('called', 'in_service'));

-- Add public read policy for counters (for public TV panel)
CREATE POLICY "Public can view active counters"
ON public.counters
FOR SELECT
USING (true);