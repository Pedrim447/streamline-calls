-- Performance indexes for tickets table
CREATE INDEX IF NOT EXISTS idx_tickets_unit_status_created 
  ON public.tickets (unit_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_tickets_unit_called_at 
  ON public.tickets (unit_id, called_at DESC) 
  WHERE called_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_unit_created_at 
  ON public.tickets (unit_id, created_at DESC);