-- Add client information columns to tickets table
ALTER TABLE public.tickets 
ADD COLUMN client_name text,
ADD COLUMN client_cpf text;