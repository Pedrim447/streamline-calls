
-- Atomic function to claim next ticket - prevents race conditions
CREATE OR REPLACE FUNCTION public.claim_next_ticket(
  _unit_id uuid,
  _counter_id uuid,
  _attendant_id uuid,
  _organ_ids uuid[] DEFAULT NULL,
  _ticket_type text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ticket record;
  _result json;
BEGIN
  -- Find and lock the next ticket atomically
  SELECT * INTO _ticket
  FROM public.tickets
  WHERE unit_id = _unit_id
    AND status = 'waiting'
    AND (_organ_ids IS NULL OR organ_id = ANY(_organ_ids))
    AND (_ticket_type IS NULL OR ticket_type::text = _ticket_type)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- No ticket found
  IF _ticket IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'no_tickets');
  END IF;

  -- Update the ticket atomically
  UPDATE public.tickets
  SET 
    status = 'called',
    called_at = now(),
    counter_id = _counter_id,
    attendant_id = _attendant_id,
    locked_by = _attendant_id,
    locked_at = now(),
    updated_at = now()
  WHERE id = _ticket.id
  RETURNING to_json(tickets.*) INTO _result;

  RETURN json_build_object('success', true, 'ticket', _result);
END;
$$;
