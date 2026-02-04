-- Remove client_cpf column from tickets table to improve security
ALTER TABLE public.tickets DROP COLUMN IF EXISTS client_cpf;