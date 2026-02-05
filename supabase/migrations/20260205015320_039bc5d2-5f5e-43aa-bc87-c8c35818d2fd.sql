-- Add organ_id to ticket_counters for per-organ ticket sequences
ALTER TABLE public.ticket_counters 
ADD COLUMN organ_id uuid REFERENCES public.organs(id) ON DELETE CASCADE;

-- Create index for efficient lookups
CREATE INDEX idx_ticket_counters_organ ON public.ticket_counters(organ_id, ticket_type, counter_date);

-- Add unique constraint to prevent duplicate counters for the same organ/type/date
CREATE UNIQUE INDEX idx_ticket_counters_organ_unique 
ON public.ticket_counters(unit_id, organ_id, ticket_type, counter_date) 
WHERE organ_id IS NOT NULL;

COMMENT ON COLUMN public.ticket_counters.organ_id IS 'When per-organ numbering is enabled, tracks ticket sequence per organ';