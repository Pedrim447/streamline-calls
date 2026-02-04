-- Remove sensitive columns from profiles table to improve security
ALTER TABLE public.profiles DROP COLUMN IF EXISTS birth_date;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cpf;