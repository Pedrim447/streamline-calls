-- Add new fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS matricula text,
ADD COLUMN IF NOT EXISTS cpf text,
ADD COLUMN IF NOT EXISTS birth_date date,
ADD COLUMN IF NOT EXISTS avatar_url text;

-- Add unique constraints for matricula and cpf
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_matricula_unique UNIQUE (matricula),
ADD CONSTRAINT profiles_cpf_unique UNIQUE (cpf);

-- Add 'recepcao' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'recepcao';